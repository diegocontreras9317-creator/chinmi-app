import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Product, Table, OrderItem, CustomerBillingInfo, CustomerDocumentType, TableSubaccount } from '../../types';
import {
  calculateColombiaNitDV,
  COLOMBIAN_CITIES_DANE,
  DOCUMENT_TYPE_OPTIONS,
  formatCustomerDocument,
  isValidEmailFormat,
  normalizeBillingInfo,
  hasCustomBillingData
} from '../../utils/billing';
import {
  calculateOrderTaxBreakdown,
  resolveProductTax
} from '../../utils/taxes';
import { auth } from '../../firebase';
import {
  subscribeUserMenu,
  subscribeSingleTable,
  subscribeUserQrConfig,
  saveTableToFirestore,
  submitQrOrderTransaction,
  requestQrBillTransaction,
  savePrivateQrBillingRecord,
} from '../../services/firestoreUserStorage';
import {
  computeOrderSubaccountsSummary,
  computeItemPendingAmount,
  computeItemTotal,
  generateSubaccountId,
  createTableSubaccount,
} from '../../utils/subaccounts';
import { formatCOP } from '../../utils/currency';
import { ChinmiLogo } from '../common/ChinmiLogo';
import { CategoryScrollBar } from '../common/CategoryScrollBar';
import { QR_THEMES, QrThemeId } from '../../config/qrThemes';
import { computeCustomContainerStyle } from '../../utils/qrCustomization';
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
  Users,
  Heart,
  MessageSquare,
  AlertCircle,
  BellRing,
  CreditCard,
  Banknote,
  Smartphone,
  Eye,
  Check,
  FileText,
  Mail
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

  // Parse URL parameters for QR scan (restId / uid & mesa / mesaId & theme)
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const urlUid = searchParams.get('restId') || searchParams.get('uid') || searchParams.get('restaurante') || '';
  const urlMesa = searchParams.get('mesa') || searchParams.get('mesaId') || tableId;
  const urlTheme = searchParams.get('theme') as QrThemeId | null;

  const [qrMenuProducts, setQrMenuProducts] = useState<Product[]>([]);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [firestoreQrSettings, setFirestoreQrSettings] = useState<any>(null);
  const [isQrLoading, setIsQrLoading] = useState<boolean>(!!urlUid);

  useEffect(() => {
    if (urlUid) {
      setIsQrLoading(true);
      const unsubMenu = subscribeUserMenu(urlUid, (prods) => {
        setQrMenuProducts(prods);
        setIsQrLoading(false);
      });
      const unsubTable = subscribeSingleTable(urlUid, urlMesa, (table) => {
        setQrTable(table);
      });
      const unsubQrSettings = subscribeUserQrConfig(urlUid, (settings) => {
        if (settings) {
          setFirestoreQrSettings(settings);
        }
      });
      return () => {
        unsubMenu();
        unsubTable();
        unsubQrSettings();
      };
    } else {
      setIsQrLoading(false);
    }
  }, [urlUid, urlMesa]);

  const activeTable = qrTable || (urlUid ? null : tables.find(t => t.id === urlMesa || t.id === tableId)) || null;
  const activeProducts = urlUid ? qrMenuProducts : (qrMenuProducts.length > 0 ? qrMenuProducts : products);

  const table = activeTable;

  const qrSettings = firestoreQrSettings || config.qrSettings || {
    allowOrdering: true,
    allowCallWaiter: true,
    allowRequestBill: true,
    menuOnlyMode: false,
    qrTheme: 'default_normal'
  };

  const activeThemeId: QrThemeId =
    firestoreQrSettings?.qrTheme ||
    (urlTheme && QR_THEMES[urlTheme] ? urlTheme : null) ||
    qrSettings.qrTheme ||
    'default_normal';

  const theme = QR_THEMES[activeThemeId] || QR_THEMES.default_normal;

  const isMenuOnly = qrSettings.menuOnlyMode || !qrSettings.allowOrdering;
  const canOrder = qrSettings.allowOrdering && !qrSettings.menuOnlyMode;
  const canCallWaiter = qrSettings.allowCallWaiter !== false;
  const canRequestBill = qrSettings.allowRequestBill !== false;
  const subaccountsMode: 'disabled' | 'optional' | 'required' = qrSettings.subaccountsMode || 'optional';
  const allowQrSubaccountJoin = qrSettings.allowQrSubaccountJoin !== false;
  const allowQrVolunteerTip = qrSettings.allowQrVolunteerTip !== false;
  const defaultSuggestedTipPercent = Math.max(0, Math.min(25, Number(qrSettings.defaultSuggestedTipPercent ?? 10) || 10));

  const activeSessionId = table?.order?.tableSessionId || table?.tableSessionId || 'classic';

  const [menuViewMode, setMenuViewMode] = useState<'list' | 'medium'>(() => {
    return qrSettings.menuViewMode === 'list' ? 'list' : 'medium';
  });

  useEffect(() => {
    if (qrSettings.menuViewMode) {
      setMenuViewMode(qrSettings.menuViewMode);
    }
  }, [qrSettings.menuViewMode]);

  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    set.add('Todas las categorías');

    if (firestoreQrSettings?.categories && Array.isArray(firestoreQrSettings.categories)) {
      firestoreQrSettings.categories.forEach((c: string) => {
        if (c && c !== 'Todas las categorías') set.add(c);
      });
    }

    if (activeProducts && activeProducts.length > 0) {
      activeProducts.forEach(p => {
        if (p.category && p.category.trim() && p.category !== 'Todas las categorías') {
          set.add(p.category.trim());
        }
      });
    }

    if (!urlUid && set.size <= 1 && config.categories && config.categories.length > 0) {
      config.categories.forEach(c => {
        if (c && c !== 'Todas las categorías') set.add(c);
      });
    }

    if (set.size <= 1) {
      ['Cervezas & Vinos', 'Bebidas & Refrescos', 'Tapas & Entrantes', 'Platos Principales', 'Cafés & Postres', 'Licores & Cócteles'].forEach(c => set.add(c));
    }

    return Array.from(set);
  }, [firestoreQrSettings?.categories, activeProducts, config.categories, urlUid]);

  const [selectedCategory, setSelectedCategory] = useState<string>('Todas las categorías');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Aislamiento estricto por restaurante + mesa + sesión activa (evita heredar PII o subcuentas de visitas anteriores)
  const billingStorageKey = `chinmi_qr_billing_${urlUid || 'local'}_${urlMesa || tableId || 'default'}_${activeSessionId}`;
  const subaccountStorageKey = `chinmi_qr_subaccount_${urlUid || 'local'}_${urlMesa || tableId || 'default'}_${activeSessionId}`;

  const [activeSubaccountId, setActiveSubaccountId] = useState<string>('');
  const [activeSubaccountName, setActiveSubaccountName] = useState<string>('');
  const [subaccountNameDraft, setSubaccountNameDraft] = useState<string>('');
  const [isSubaccountSwitcherOpen, setIsSubaccountSwitcherOpen] = useState<boolean>(false);
  const [summaryScope, setSummaryScope] = useState<'mine' | 'table'>('mine');

  const [hasSkippedWelcome, setHasSkippedWelcome] = useState<boolean>(false);
  const [newSubaccountInput, setNewSubaccountInput] = useState<string>('');
  const [isAddingNewPerson, setIsAddingNewPerson] = useState<boolean>(false);

  const handleWelcomeSelectSubaccount = (sub: TableSubaccount) => {
    setActiveSubaccountId(sub.id);
    setActiveSubaccountName(sub.displayName);
    setCustomerName(sub.displayName);
    setHasSkippedWelcome(true);
  };

  const handleWelcomeAddNewSubaccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newSubaccountInput.trim();
    if (!clean || !table) return;

    const newSub = createTableSubaccount({
      tableId: table.id,
      tableSessionId: activeSessionId,
      desiredName: clean,
      existingSubaccounts: tableSubaccounts,
    });

    const targetUid = urlUid || auth.currentUser?.uid;
    const nextSubaccounts = [...tableSubaccounts, newSub];

    setActiveSubaccountId(newSub.id);
    setActiveSubaccountName(newSub.displayName);
    setCustomerName(newSub.displayName);
    setHasSkippedWelcome(true);
    setNewSubaccountInput('');
    setIsAddingNewPerson(false);

    if (targetUid) {
      try {
        const updatedTable: Table = {
          ...table,
          subaccounts: nextSubaccounts,
          updatedAt: new Date().toISOString(),
        };
        await saveTableToFirestore(updatedTable, targetUid);
      } catch (err) {
        console.error('Error guardando nueva subcuenta en Firestore:', err);
      }
    }
  };

  const handleWelcomeContinueWithout = () => {
    setHasSkippedWelcome(true);
  };

  // Propina voluntaria (Ley 1935/2018)
  const [tipMode, setTipMode] = useState<'none' | 'suggested' | '15' | 'custom_pct' | 'custom_amt'>('none');
  const [customTipPercent, setCustomTipPercent] = useState<string>('');
  const [customTipAmount, setCustomTipAmount] = useState<string>('');
  const [billScope, setBillScope] = useState<'mine' | 'table'>('mine');

  // Sincronizar subcuenta local por sesión activa de mesa
  useEffect(() => {
    if (typeof window === 'undefined' || subaccountsMode === 'disabled') return;
    try {
      const saved = localStorage.getItem(subaccountStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.id) setActiveSubaccountId(parsed.id);
        if (parsed?.displayName) setActiveSubaccountName(parsed.displayName);
      } else {
        setActiveSubaccountId('');
        setActiveSubaccountName('');
      }
    } catch {
      setActiveSubaccountId('');
      setActiveSubaccountName('');
    }
  }, [subaccountStorageKey, subaccountsMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || subaccountsMode === 'disabled') return;
    if (!activeSubaccountId && !activeSubaccountName) return;
    try {
      localStorage.setItem(
        subaccountStorageKey,
        JSON.stringify({ id: activeSubaccountId, displayName: activeSubaccountName })
      );
    } catch {}
  }, [subaccountStorageKey, activeSubaccountId, activeSubaccountName, subaccountsMode]);

  // Limpiar automáticamente nombres y subcuentas del QR apenas se cierra la venta o se libera la mesa
  useEffect(() => {
    if (!table || !table.order || table.order.closed || table.status === 'libre') {
      setActiveSubaccountId('');
      setActiveSubaccountName('');
      setHasSkippedWelcome(false);
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(subaccountStorageKey);
        }
      } catch {}
    }
  }, [table?.status, table?.order?.closed, table?.order?.id, subaccountStorageKey, table]);

  const [customerName, setCustomerName] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const saved = localStorage.getItem(billingStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.customerName || '';
      }
    } catch {}
    return '';
  });
  const [customerDocType, setCustomerDocType] = useState<CustomerDocumentType>(() => {
    if (typeof window === 'undefined') return 'CONSUMIDOR_FINAL';
    try {
      const saved = localStorage.getItem(billingStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.documentType || 'CONSUMIDOR_FINAL';
      }
    } catch {}
    return 'CONSUMIDOR_FINAL';
  });
  const [customerDocNumber, setCustomerDocNumber] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const saved = localStorage.getItem(billingStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.documentNumber || '';
      }
    } catch {}
    return '';
  });
  const [customerEmail, setCustomerEmail] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const saved = localStorage.getItem(billingStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.email || '';
      }
    } catch {}
    return '';
  });
  const [customerPhone, setCustomerPhone] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const saved = localStorage.getItem(billingStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.phone || '';
      }
    } catch {}
    return '';
  });
  const [customerCity, setCustomerCity] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const saved = localStorage.getItem(billingStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.city || '';
      }
    } catch {}
    return '';
  });
  const [customerAddress, setCustomerAddress] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const saved = localStorage.getItem(billingStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.address || '';
      }
    } catch {}
    return '';
  });
  const [wantsElectronicInvoice, setWantsElectronicInvoice] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const saved = localStorage.getItem(billingStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Boolean(parsed.requiresElectronicInvoice || parsed.email);
      }
    } catch {}
    return false;
  });
  const [showCartBillingFields, setShowCartBillingFields] = useState<boolean>(false);

  const [activeItemForNote, setActiveItemForNote] = useState<Product | null>(null);
  const [itemNoteText, setItemNoteText] = useState('');
  const [orderSentSuccess, setOrderSentSuccess] = useState(false);
  const [portalErrorMsg, setPortalErrorMsg] = useState<string | null>(null);

  // Modals for Waiter & Bill
  const [isCallWaiterModalOpen, setIsCallWaiterModalOpen] = useState(false);
  const [waiterCallReason, setWaiterCallReason] = useState<string>('Tomar pedido en la mesa');
  const [waiterCallSuccess, setWaiterCallSuccess] = useState<string | null>(null);

  const [isRequestBillModalOpen, setIsRequestBillModalOpen] = useState(false);
  const [paymentMethodChoice, setPaymentMethodChoice] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('tarjeta');
  const [cashAmountNote, setCashAmountNote] = useState('');
  const [billRequestError, setBillRequestError] = useState<string | null>(null);
  const [billRequestSuccess, setBillRequestSuccess] = useState<string | null>(null);

  // Persist customer billing details locally on phone for convenience
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        billingStorageKey,
        JSON.stringify({
          customerName,
          documentType: customerDocType,
          documentNumber: customerDocNumber,
          email: customerEmail,
          phone: customerPhone,
          city: customerCity,
          address: customerAddress,
          requiresElectronicInvoice: wantsElectronicInvoice
        })
      );
    } catch {}
  }, [
    billingStorageKey,
    customerName,
    customerDocType,
    customerDocNumber,
    customerEmail,
    customerPhone,
    customerCity,
    customerAddress,
    wantsElectronicInvoice
  ]);

  // Aislamiento estricto: jamás hidratar PII de otros clientes de la mesa ni de sesiones anteriores

  // Detail Modal for Product Image & Ingredients
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(null);
  const [detailQuantity, setDetailQuantity] = useState<number>(1);
  const [detailNotes, setDetailNotes] = useState<string>('');

  const openProductDetail = (prod: Product) => {
    setSelectedProductForDetail(prod);
    setDetailQuantity(1);
    setDetailNotes('');
  };

  // Configuración de Impuestos para Colombia (Impoconsumo 8% o IVA según configuración del negocio)
  const taxRate = Number(config.defaultTaxRate) || 8;

  /**
   * En Colombia los precios del menú digital QR deben mostrarse obligatoriamente con impuestos incluidos (Impoconsumo/IVA)
   * para coincidir 1:1 con el ticket de caja, la comanda y la cuenta final del cliente.
   */
  const getTaxInclusivePrice = (basePrice: number): number => {
    if (isNaN(basePrice) || basePrice <= 0) return 0;
    // Los precios P.V.P ya tienen el impuesto incluido
    return basePrice;
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    const list = activeProducts.filter(p => {
      const matchesCat = selectedCategory === 'Todas las categorías' || p.category === selectedCategory;
      const matchesQuery = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (p.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesQuery;
    });
    return list.sort((a, b) => {
      const orderA = a.displayOrder ?? 0;
      const orderB = b.displayOrder ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }, [activeProducts, selectedCategory, searchQuery]);

  // Cart totals (Precios P.V.P con impuesto incluido: Total a cobrar = Subtotal)
  const cartItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartTaxSummary = useMemo(() => {
    const pseudoItems = cart.map((c) => {
      const resolved = resolveProductTax(c.product, taxRate);
      return {
        productId: c.product.id,
        unitPrice: c.product.price,
        quantity: c.quantity,
        taxType: resolved.taxType,
        taxRate: resolved.taxRate
      };
    });
    return calculateOrderTaxBreakdown(pseudoItems, {
      discountPercent: 0,
      fallbackTaxRate: taxRate,
      productsCatalog: activeProducts
    });
  }, [cart, taxRate, activeProducts]);
  const cartTaxInclusiveTotal = cartTaxSummary.productsTotal;
  const cartTaxAmount = Math.round(cartTaxSummary.totalTaxAmount);

  // Existing table order & subaccounts overview (Precios P.V.P con impuesto incluido)
  const existingOrder = table?.order;
  const existingItemsCount = existingOrder?.items.reduce((acc, it) => acc + it.quantity, 0) || 0;
  const existingOrderTaxRate = Number(existingOrder?.taxPercent ?? taxRate) || taxRate;
  const existingTaxSummary = useMemo(() => {
    return calculateOrderTaxBreakdown(
      (existingOrder?.items || []) as unknown as Array<Partial<OrderItem> & Record<string, unknown>>,
      {
        discountPercent: Number(existingOrder?.discountPercent) || 0,
        fallbackTaxRate: existingOrderTaxRate,
        productsCatalog: activeProducts
      }
    );
  }, [existingOrder?.items, existingOrder?.discountPercent, existingOrderTaxRate, activeProducts]);
  const existingTaxInclusiveTotal = existingTaxSummary.productsTotal;
  const existingTaxAmount = Math.round(existingTaxSummary.totalTaxAmount);

  const subaccountsOverview = useMemo(
    () => computeOrderSubaccountsSummary(existingOrder, existingOrderTaxRate, table?.subaccounts),
    [existingOrder, existingOrderTaxRate, table?.subaccounts]
  );

  const tableSubaccounts: TableSubaccount[] = useMemo(() => {
    const raw = existingOrder?.subaccounts || table?.subaccounts || [];
    return raw.filter((s) => s.status !== 'cerrada');
  }, [existingOrder?.subaccounts, table?.subaccounts]);

  const mySubaccountSummary = useMemo(() => {
    if (!activeSubaccountId) return null;
    return subaccountsOverview.subaccounts.find((s) => s.subaccountId === activeSubaccountId) || null;
  }, [subaccountsOverview, activeSubaccountId]);

  const effectiveBillSubtotalPending = useMemo(() => {
    if (subaccountsMode !== 'disabled' && billScope === 'mine' && activeSubaccountId && mySubaccountSummary) {
      return mySubaccountSummary.pendingNetWithTax;
    }
    return subaccountsOverview.tablePendingNetWithTax || existingTaxInclusiveTotal;
  }, [
    subaccountsMode,
    billScope,
    activeSubaccountId,
    mySubaccountSummary,
    subaccountsOverview.tablePendingNetWithTax,
    existingTaxInclusiveTotal,
  ]);

  const computedTipAmount = useMemo(() => {
    if (!allowQrVolunteerTip || tipMode === 'none') return 0;
    const base = Math.max(0, Math.round(effectiveBillSubtotalPending));
    if (tipMode === 'suggested') return Math.round((base * defaultSuggestedTipPercent) / 100);
    if (tipMode === '15') return Math.round((base * 15) / 100);
    if (tipMode === 'custom_pct') {
      const pct = Math.max(0, Math.min(50, Number(customTipPercent.replace(',', '.')) || 0));
      return Math.round((base * pct) / 100);
    }
    if (tipMode === 'custom_amt') {
      return Math.max(0, Math.round(Number(customTipAmount.replace(/[^0-9]/g, '')) || 0));
    }
    return 0;
  }, [allowQrVolunteerTip, tipMode, effectiveBillSubtotalPending, defaultSuggestedTipPercent, customTipPercent, customTipAmount]);

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

  const handleSelectOrCreateSubaccount = (desiredName: string, existingSub?: TableSubaccount) => {
    const clean = desiredName.trim();
    if (!clean) return;
    if (existingSub) {
      setActiveSubaccountId(existingSub.id);
      setActiveSubaccountName(existingSub.displayName);
      setCustomerName(existingSub.displayName);
      setSubaccountNameDraft('');
      setIsSubaccountSwitcherOpen(false);
      return;
    }
    const newId = generateSubaccountId();
    setActiveSubaccountId(newId);
    setActiveSubaccountName(clean);
    setCustomerName(clean);
    setSubaccountNameDraft('');
    setIsSubaccountSwitcherOpen(false);
  };

  // Submit cart order directly to kitchen/POS using atomic transaction (prevents multi-phone overwrites)
  const handleSendOrder = async () => {
    if (!table || cart.length === 0 || !canOrder) return;
    setPortalErrorMsg(null);

    const desiredGuestName = (activeSubaccountName || customerName).trim();
    if (subaccountsMode === 'required' && !desiredGuestName) {
      setPortalErrorMsg('Por favor escribe tu nombre o selecciona tu subcuenta para identificar tu pedido en la mesa.');
      return;
    }

    const cleanCartEmail = customerEmail.trim().toLowerCase();
    if (cleanCartEmail && !isValidEmailFormat(cleanCartEmail)) {
      setPortalErrorMsg('Por favor ingresa un correo electrónico válido para la factura electrónica.');
      return;
    }

    const targetUid = urlUid || auth.currentUser?.uid;
    const nowIso = new Date().toISOString();

    const cleanNewItems: OrderItem[] = cart.map((c, idx) => {
      const resolvedProdTax = resolveProductTax(c.product, taxRate);
      return {
        id: `it-qr-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        productId: c.product.id || '',
        name: c.product.name || 'Producto',
        unitPrice: Number(c.product.price) || 0,
        quantity: Number(c.quantity) || 1,
        notes: c.notes?.trim() || '',
        addedAt: nowIso,
        customerName: desiredGuestName || 'Cliente QR',
        orderedBy: 'cliente',
        taxType: resolvedProdTax.taxType,
        taxRate: resolvedProdTax.taxRate,
      };
    });

    const useSubaccountNow =
      subaccountsMode === 'required' ||
      (subaccountsMode === 'optional' && Boolean(activeSubaccountId || desiredGuestName));

    try {
      if (targetUid) {
        const subIdToUse = useSubaccountNow ? (activeSubaccountId || generateSubaccountId()) : undefined;
        const txResult = await submitQrOrderTransaction({
          uid: targetUid,
          tableId: table.id,
          tableName: table.name || `Mesa ${table.number}`,
          incomingItems: cleanNewItems,
          defaultTaxRate: taxRate,
          subaccountInput: useSubaccountNow
            ? {
                id: subIdToUse,
                desiredName: desiredGuestName || 'Invitado',
              }
            : null,
          legacyCustomerName: desiredGuestName || 'Cliente QR',
        });

        if (txResult.resolvedSubaccount) {
          setActiveSubaccountId(txResult.resolvedSubaccount.id);
          setActiveSubaccountName(txResult.resolvedSubaccount.displayName);
          if (!customerName.trim()) {
            setCustomerName(txResult.resolvedSubaccount.displayName);
          }
        }
      } else {
        addItemsToOrder(
          table.id,
          cart.map((c) => ({
            product: c.product,
            quantity: c.quantity,
            notes: c.notes,
            customerName: desiredGuestName || 'Cliente QR',
            orderedBy: 'cliente',
          }))
        );
      }

      setOrderSentSuccess(true);
      setTimeout(() => setOrderSentSuccess(false), 6000);
      setCart([]);
      setIsCartOpen(false);
    } catch (error: any) {
      console.error('Error al guardar pedido en Firestore:', error);
      setPortalErrorMsg('No se pudo enviar el pedido: ' + (error?.message || String(error)));
    }
  };

  // Action: Call Waiter
  const handleConfirmCallWaiter = async () => {
    if (!table) return;
    const nowIso = new Date().toISOString();
    const who = activeSubaccountName ? ` (${activeSubaccountName})` : '';
    const msg = `Mesa ${table.number}${who} solicita atención: ${waiterCallReason}`;

    const updatedTable: Table = {
      ...table,
      updatedAt: nowIso,
      waiterCall: {
        type: 'waiter',
        requestedAt: nowIso,
        message: msg,
        ...(activeSubaccountId ? { subaccountId: activeSubaccountId } : {}),
        ...(activeSubaccountName ? { subaccountName: activeSubaccountName } : {}),
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

  // Action: Request Bill (isolated fiscal PII dropbox + optional subaccount + voluntary tip Law 1935/2018)
  const handleConfirmRequestBill = async () => {
    if (!table) return;
    setPortalErrorMsg(null);
    setBillRequestError(null);

    const cleanBillEmail = customerEmail.trim().toLowerCase();
    if (wantsElectronicInvoice && !cleanBillEmail) {
      setBillRequestError('Ingresa tu correo electrónico para enviarte la Factura Electrónica.');
      return;
    }
    if (wantsElectronicInvoice && customerDocType === 'CONSUMIDOR_FINAL') {
      setBillRequestError('Selecciona el tipo de documento (C.C. o NIT) para emitir Factura Electrónica.');
      return;
    }
    if (wantsElectronicInvoice && !customerDocNumber.trim()) {
      setBillRequestError('Ingresa tu número de documento para emitir Factura Electrónica.');
      return;
    }
    if (cleanBillEmail && !isValidEmailFormat(cleanBillEmail)) {
      setBillRequestError('Ingresa un correo electrónico válido (ejemplo: nombre@correo.com).');
      return;
    }

    const methodText = paymentMethodChoice === 'efectivo'
      ? `Efectivo${cashAmountNote ? ` (paga con: ${cashAmountNote})` : ''}`
      : paymentMethodChoice === 'tarjeta'
      ? 'Tarjeta / Datáfono'
      : 'Transferencia / Nequi / Daviplata';

    const candidateBilling: Partial<CustomerBillingInfo> = {
      customerName: customerName.trim() || activeSubaccountName.trim(),
      documentType: customerDocType,
      documentNumber: customerDocNumber.trim(),
      email: cleanBillEmail,
      phone: customerPhone.trim(),
      city: customerCity.trim(),
      address: customerAddress.trim(),
      requiresElectronicInvoice: Boolean(wantsElectronicInvoice || cleanBillEmail)
    };
    const hasBilling = hasCustomBillingData(candidateBilling);
    const normalizedBilling = hasBilling ? normalizeBillingInfo(candidateBilling) : undefined;

    const targetUid = urlUid || auth.currentUser?.uid;
    const nowIso = new Date().toISOString();
    const sessionIdForBilling = table.order?.tableSessionId || table.tableSessionId || table.order?.id || table.id;
    const scopedSubId =
      subaccountsMode !== 'disabled' && billScope === 'mine' && activeSubaccountId
        ? activeSubaccountId
        : undefined;
    const scopedSubName =
      scopedSubId
        ? activeSubaccountName || customerName.trim() || 'Invitado'
        : undefined;

    const privateBillingDocId =
      hasBilling && normalizedBilling
        ? `${sessionIdForBilling}__${scopedSubId || 'mesa_general'}`
        : undefined;

    try {
      if (targetUid && privateBillingDocId && normalizedBilling) {
        await savePrivateQrBillingRecord(targetUid, {
          id: privateBillingDocId,
          tableId: table.id,
          tableSessionId: sessionIdForBilling,
          subaccountId: scopedSubId || 'mesa_general',
          subaccountName: scopedSubName || normalizedBilling.customerName || 'Cuenta Mesa',
          requiresElectronicInvoice: Boolean(normalizedBilling.requiresElectronicInvoice),
          billingInfo: normalizedBilling,
          requestedTipAmount: computedTipAmount,
          preferredPaymentMethod: paymentMethodChoice,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }

      if (targetUid && table.order && !table.order.closed) {
        await requestQrBillTransaction({
          uid: targetUid,
          tableId: table.id,
          preferredPaymentMethod: paymentMethodChoice,
          subaccountId: scopedSubId,
          subaccountName: scopedSubName,
          requestedTipAmount: computedTipAmount,
          requiresElectronicInvoice: Boolean(wantsElectronicInvoice),
          privateQrBillingId: privateBillingDocId,
          // Jamás publicar PII en el documento compartido cuando hay subcuentas o buzón privado
          legacyBillingInfo: undefined,
        });
      } else {
        const msg = `Mesa ${table.number}${scopedSubName ? ` · Subcuenta: ${scopedSubName}` : ''} solicita la cuenta. Método: ${methodText}`;
        callWaiter(table.id, 'bill', msg, {
          preferredPaymentMethod: paymentMethodChoice,
        });
      }

      setIsRequestBillModalOpen(false);
      const tipSummary = computedTipAmount > 0 ? ` · Propina voluntaria: ${formatCOP(computedTipAmount)}` : '';
      const feMsg = wantsElectronicInvoice ? ' · Solicitud privada de Factura Electrónica enviada a caja' : '';
      setBillRequestSuccess(
        `¡Cuenta solicitada${scopedSubName ? ` (${scopedSubName})` : ''}! Pago: ${methodText}${tipSummary}${feMsg}.`
      );
      setTimeout(() => setBillRequestSuccess(null), 8000);
    } catch (err: any) {
      console.error('Error guardando solicitud de cuenta en Firestore:', err);
      setBillRequestError('No se pudo registrar la solicitud de cuenta: ' + (err?.message || String(err)));
    }
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
        <div className="w-12 h-12 rounded-full border-4 border-stone-200 dark:border-stone-800 border-t-rose-950 dark:border-t-rose-400 animate-spin mb-4" />
        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">Cargando menú de la mesa...</p>
      </div>
    );
  }

  if (!urlUid || !urlMesa || !table) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-24 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 flex items-center justify-center text-4xl mb-5 shadow-xs border border-stone-200 dark:border-stone-700">
          📱
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white max-w-sm">
          Escanea el código QR de tu mesa para ver el menú
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mt-2 mb-8 leading-relaxed">
          Para consultar la carta digital, pedir platos o llamar al mesero, apunta la cámara de tu celular al código QR ubicado sobre tu mesa.
        </p>
        <div className="p-4 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs text-left max-w-xs w-full space-y-2.5 mb-6">
          <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-semibold">
            <span className="w-5 h-5 rounded-md bg-rose-950 text-white flex items-center justify-center font-bold text-[10px]">1</span>
            <span>Abre la cámara de tu celular</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-semibold">
            <span className="w-5 h-5 rounded-md bg-rose-950 text-white flex items-center justify-center font-bold text-[10px]">2</span>
            <span>Apunta al código QR de la mesa</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-semibold">
            <span className="w-5 h-5 rounded-md bg-rose-950 text-white flex items-center justify-center font-bold text-[10px]">3</span>
            <span>Accede al menú interactivo</span>
          </div>
        </div>
      </div>
    );
  }

  const bgImage = urlUid ? (firestoreQrSettings?.bgImageUrl || '') : (firestoreQrSettings?.bgImageUrl || qrSettings.bgImageUrl || '');
  const customTextColor = urlUid ? (firestoreQrSettings?.textColor || '') : (firestoreQrSettings?.textColor || qrSettings.textColor || '');
  const customAccentColor = urlUid ? (firestoreQrSettings?.accentColor || '#e11d48') : (firestoreQrSettings?.accentColor || qrSettings.accentColor || '#e11d48');
  const restaurantLogo = urlUid ? (firestoreQrSettings?.logoUrl || '') : (firestoreQrSettings?.logoUrl || qrSettings.logoUrl || config.logoUrl || '');
  const restaurantBanner = urlUid ? (firestoreQrSettings?.bannerUrl || '') : (firestoreQrSettings?.bannerUrl || qrSettings.bannerUrl || '');
  const restaurantName = (urlUid ? (firestoreQrSettings?.businessName || '') : '') || config.businessName || 'Restaurante';
  const restaurantInitials = restaurantName
    .split(' ')
    .filter(Boolean)
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'R';

  const isWaiterCurrentlyCalled = table.waiterCall?.type === 'waiter';

  const showWelcomeScreen =
    subaccountsMode !== 'disabled' &&
    !hasSkippedWelcome;

  if (showWelcomeScreen && table) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-col items-center space-y-3">
            {restaurantLogo ? (
              <img
                src={restaurantLogo}
                alt={restaurantName}
                className="w-16 h-16 rounded-2xl border border-slate-200 dark:border-slate-700 object-contain bg-white shadow-md p-1"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl qr-accent-bg text-white font-black text-2xl flex items-center justify-center shadow-md">
                {restaurantInitials}
              </div>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {restaurantName}
              </h1>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
                📍 Mesa {table.number} {table.zone ? `(${table.zone})` : ''}
              </p>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-4">
            <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
              ¿Quién va a realizar el pedido?
            </h2>

            {tableSubaccounts.length > 0 ? (
              <div className="space-y-2 text-left max-h-48 overflow-y-auto pr-1">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Personas ya registradas en esta mesa:
                </p>
                {tableSubaccounts.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => handleWelcomeSelectSubaccount(sub)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-900 dark:hover:border-white bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200 transition cursor-pointer group"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-rose-950 text-white flex items-center justify-center text-xs font-bold">
                        {sub.displayName.charAt(0).toUpperCase()}
                      </span>
                      <span>{sub.displayName}</span>
                    </span>
                    <span className="text-[11px] text-rose-900 dark:text-rose-400 group-hover:underline">
                      Seleccionar →
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                Aún no hay personas registradas en esta mesa. Sé el primero en unirte.
              </p>
            )}

            {!isAddingNewPerson ? (
              <button
                type="button"
                onClick={() => setIsAddingNewPerson(true)}
                className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-rose-950 dark:hover:border-rose-400 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar otra persona</span>
              </button>
            ) : (
              <form onSubmit={handleWelcomeAddNewSubaccount} className="space-y-2.5 pt-1 text-left">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Escribe tu nombre:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubaccountInput}
                    onChange={(e) => setNewSubaccountInput(e.target.value)}
                    placeholder="Ej. Carlos, María..."
                    autoFocus
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={!newSubaccountInput.trim()}
                    className="px-4 py-2 rounded-xl qr-accent-bg text-white font-bold text-xs disabled:opacity-50 transition cursor-pointer shrink-0"
                  >
                    Unirme
                  </button>
                </div>
              </form>
            )}

            {subaccountsMode === 'optional' && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleWelcomeContinueWithout}
                  className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white underline cursor-pointer"
                >
                  Continuar al menú sin subcuenta
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  const isBillCurrentlyRequested = table.status === 'cuenta' || table.waiterCall?.type === 'bill';

  // Personalización avanzada computada para Tarjetas de Productos y Contenedor de Categorías
  const categoryCustomStyles = computeCustomContainerStyle({
    bgColor: urlUid ? firestoreQrSettings?.catBgColor : (firestoreQrSettings?.catBgColor || qrSettings.catBgColor),
    bgOpacity: urlUid ? firestoreQrSettings?.catBgOpacity : (firestoreQrSettings?.catBgOpacity ?? qrSettings.catBgOpacity),
    bgImageUrl: urlUid ? firestoreQrSettings?.catBgImageUrl : (firestoreQrSettings?.catBgImageUrl || qrSettings.catBgImageUrl),
    bgFit: urlUid ? firestoreQrSettings?.catBgFit : (firestoreQrSettings?.catBgFit || qrSettings.catBgFit),
    overlayColor: urlUid ? firestoreQrSettings?.catOverlayColor : (firestoreQrSettings?.catOverlayColor || qrSettings.catOverlayColor),
    overlayOpacity: urlUid ? firestoreQrSettings?.catOverlayOpacity : (firestoreQrSettings?.catOverlayOpacity ?? qrSettings.catOverlayOpacity),
    textColor: urlUid ? firestoreQrSettings?.catTextColor : (firestoreQrSettings?.catTextColor || qrSettings.catTextColor),
    autoContrast: urlUid ? firestoreQrSettings?.catAutoContrast : (firestoreQrSettings?.catAutoContrast ?? qrSettings.catAutoContrast)
  });

  const productCardCustomStyles = computeCustomContainerStyle({
    bgColor: urlUid ? firestoreQrSettings?.cardBgColor : (firestoreQrSettings?.cardBgColor || qrSettings.cardBgColor),
    bgOpacity: urlUid ? firestoreQrSettings?.cardBgOpacity : (firestoreQrSettings?.cardBgOpacity ?? qrSettings.cardBgOpacity),
    bgImageUrl: urlUid ? firestoreQrSettings?.cardBgImageUrl : (firestoreQrSettings?.cardBgImageUrl || qrSettings.cardBgImageUrl),
    bgFit: urlUid ? firestoreQrSettings?.cardBgFit : (firestoreQrSettings?.cardBgFit || qrSettings.cardBgFit),
    overlayColor: urlUid ? firestoreQrSettings?.cardOverlayColor : (firestoreQrSettings?.cardOverlayColor || qrSettings.cardOverlayColor),
    overlayOpacity: urlUid ? firestoreQrSettings?.cardOverlayOpacity : (firestoreQrSettings?.cardOverlayOpacity ?? qrSettings.cardOverlayOpacity),
    textColor: urlUid ? firestoreQrSettings?.cardTextColor : (firestoreQrSettings?.cardTextColor || qrSettings.cardTextColor),
    autoContrast: urlUid ? firestoreQrSettings?.cardAutoContrast : (firestoreQrSettings?.cardAutoContrast ?? qrSettings.cardAutoContrast)
  });

  return (
    <div 
      className="min-h-screen flex flex-col pb-36 relative"
      style={{
        ...(bgImage ? {
          backgroundImage: `url(${bgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        } : {}),
        ...(customTextColor ? { color: customTextColor } : {})
      }}
    >
      <style>{`
        .qr-accent-bg { background-color: ${customAccentColor} !important; color: #ffffff !important; }
        .qr-accent-text { color: ${customAccentColor} !important; }
        .qr-accent-border { border-color: ${customAccentColor} !important; }
      `}</style>
      
      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-4 py-4 w-full space-y-4">
        
        {/* Restaurant Brand Banner (1200 x 600 - 2:1 panoramic ratio) or Minimalist Header */}
        {restaurantBanner ? (
          <div className="relative w-full aspect-[2/1] max-h-52 sm:max-h-64 rounded-2xl overflow-hidden bg-slate-900 shadow-md border border-slate-200/60 dark:border-slate-800">
            <img
              src={restaurantBanner}
              alt={restaurantName}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
            
            {onExit && (
              <button
                type="button"
                onClick={handleExitPortal}
                title="Volver al panel principal"
                className="absolute top-3 right-3 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition cursor-pointer z-10 border border-white/20"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 right-3 flex items-end gap-3">
              {restaurantLogo ? (
                <img
                  src={restaurantLogo}
                  alt={restaurantName}
                  className="w-13 h-13 sm:w-16 sm:h-16 rounded-2xl border-2 border-white/90 shadow-lg object-contain bg-white shrink-0 p-0.5"
                />
              ) : (
                <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-2xl border-2 border-white/90 shadow-lg qr-accent-bg text-white font-black text-lg sm:text-xl flex items-center justify-center shrink-0">
                  {restaurantInitials}
                </div>
              )}
              <div className="min-w-0 flex-1 drop-shadow-sm pb-0.5">
                <h2 className="font-extrabold text-base sm:text-xl text-white leading-tight truncate">
                  {restaurantName}
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-white/90 font-medium mt-0.5">
                  <span className="font-bold text-white px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-xs text-[11px] border border-white/20">
                    📍 Mesa {table.number}
                  </span>
                  <span>·</span>
                  <span className="truncate">{table.zone}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {restaurantLogo ? (
                <img
                  src={restaurantLogo}
                  alt={restaurantName}
                  className="w-12 h-12 rounded-xl border border-slate-200/80 dark:border-slate-700 object-contain bg-white shrink-0 shadow-2xs p-0.5"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl qr-accent-bg text-white font-black text-base flex items-center justify-center shrink-0 shadow-2xs">
                  {restaurantInitials}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="font-extrabold text-base text-slate-900 dark:text-white leading-tight truncate">
                  {restaurantName}
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  <span className="font-bold qr-accent-text">📍 Mesa {table.number}</span>
                  <span>·</span>
                  <span className="truncate">{table.zone}</span>
                </div>
              </div>
            </div>

            {onExit && (
              <button
                type="button"
                onClick={handleExitPortal}
                title="Volver al panel principal"
                className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer text-slate-700 dark:text-slate-300 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        
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
                  El personal llevará el total a tu mesa. Total actual: {formatCOP(existingTaxInclusiveTotal)}.
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

        {/* Portal Error Banner */}
        {portalErrorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2 text-xs font-semibold">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{portalErrorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setPortalErrorMsg(null)}
              className="p-1 text-rose-500 hover:text-rose-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Informative Banner for "Solo Ver Menú" mode */}
        {isMenuOnly && (
          <div className="p-3.5 rounded-md bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-md bg-rose-950 text-white">
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
                className="px-3 py-1.5 rounded-md bg-rose-950 hover:bg-rose-900 text-white font-bold text-xs shadow-xs shrink-0 cursor-pointer"
              >
                Llamar Mesero
              </button>
            )}
          </div>
        )}

        {/* Search & Category Filter Navigation */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar platos, bebidas, cócteles o ingredientes..."
              className="w-full pl-10 pr-9 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Smooth Scrollable Categories */}
          <CategoryScrollBar
            categories={categoriesList}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            activeClass="qr-accent-bg text-white shadow-xs font-extrabold"
            inactiveClass="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-200/60 dark:hover:bg-slate-700/80 font-semibold shadow-2xs"
          />
        </div>

        {/* Products List & View Mode Switcher */}
        <div className="space-y-3">
          <div
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between flex-wrap gap-3 relative overflow-hidden"
            style={categoryCustomStyles.hasCustomStyle ? categoryCustomStyles.containerStyle : undefined}
          >
            {categoryCustomStyles.overlayStyle && <div style={categoryCustomStyles.overlayStyle} />}
            <h3
              className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2 relative z-10"
              style={categoryCustomStyles.computedTextColor ? { color: categoryCustomStyles.computedTextColor } : undefined}
            >
              <span className="w-2 h-2 rounded-full qr-accent-bg shrink-0" />
              <span>{selectedCategory}</span>
              <span className="text-xs font-medium bg-black/10 dark:bg-white/10 px-2.5 py-0.5 rounded-full">
                {filteredProducts.length} {filteredProducts.length === 1 ? 'producto' : 'productos'}
              </span>
            </h3>

            {/* View Mode Selector */}
            <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-xl border border-slate-200/40 dark:border-slate-700/40 text-xs relative z-10">
              {(['list', 'medium'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setMenuViewMode(mode)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer capitalize ${
                    menuViewMode === mode
                      ? 'qr-accent-bg text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  style={menuViewMode !== mode && categoryCustomStyles.computedTextColor ? { color: categoryCustomStyles.computedTextColor, opacity: 0.8 } : undefined}
                  title={`Vista ${mode}`}
                >
                  {mode === 'list' ? 'Lista' : 'Mediano'}
                </button>
              ))}
            </div>
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
            <div
              className={
                menuViewMode === 'list'
                  ? 'space-y-2.5'
                  : 'grid grid-cols-1 sm:grid-cols-2 gap-3.5'
              }
            >
              {filteredProducts.map((product) => {
                const isOutOfStock = product.stock <= 0;
                const inCartItem = cart.find(c => c.product.id === product.id);

                // 1. LIST VIEW MODE
                if (menuViewMode === 'list') {
                  return (
                    <div
                      key={product.id}
                      style={productCardCustomStyles.hasCustomStyle ? productCardCustomStyles.containerStyle : undefined}
                      className={`p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-slate-900 border transition-all duration-200 flex items-center justify-between gap-3 relative overflow-hidden ${
                        isOutOfStock ? 'opacity-65 border-slate-200 dark:border-slate-800' : 'border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md'
                      }`}
                    >
                      {productCardCustomStyles.overlayStyle && <div style={productCardCustomStyles.overlayStyle} />}
                      <div className="flex items-center gap-3 min-w-0 flex-1 relative z-10">
                        <div
                          onClick={() => openProductDetail(product)}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 relative cursor-pointer border border-slate-100 dark:border-slate-800"
                        >
                          <img
                            src={product.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80'}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {isOutOfStock && (
                            <div className="absolute inset-0 bg-black/65 flex items-center justify-center p-0.5 text-center">
                              <span className="text-[8px] font-black text-rose-300 uppercase">Agotado</span>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4
                            onClick={() => openProductDetail(product)}
                            className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white truncate cursor-pointer hover:opacity-85 transition-colors"
                            style={productCardCustomStyles.computedTextColor ? { color: productCardCustomStyles.computedTextColor } : undefined}
                          >
                            {product.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono font-black text-xs sm:text-sm qr-accent-text tracking-tight">
                              {formatCOP(product.price)}
                            </span>
                            <span
                              className="text-[10px] text-slate-400 dark:text-slate-500 font-medium"
                              style={productCardCustomStyles.computedTextColor ? { color: productCardCustomStyles.computedTextColor, opacity: 0.7 } : undefined}
                            >
                              ({resolveProductTax(product, taxRate).shortLabel} incl.)
                            </span>
                          </div>
                        </div>
                      </div>

                      {canOrder && (
                        <div className="shrink-0 relative z-10">
                          {inCartItem ? (
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700">
                              <button
                                type="button"
                                onClick={() => {
                                  const idx = cart.findIndex(c => c.product.id === product.id);
                                  if (idx > -1) handleUpdateCartQuantity(idx, -1);
                                }}
                                className="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center hover:bg-slate-200 transition shadow-xs text-xs"
                              >
                                -
                              </button>
                              <span className="w-5 text-center font-bold text-xs" style={productCardCustomStyles.computedTextColor ? { color: productCardCustomStyles.computedTextColor } : undefined}>{inCartItem.quantity}</span>
                              <button
                                type="button"
                                onClick={() => handleAddToCart(product)}
                                className="w-6 h-6 rounded-lg qr-accent-bg text-white font-bold flex items-center justify-center hover:opacity-90 transition shadow-xs text-xs"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddToCart(product)}
                              disabled={isOutOfStock}
                              className="px-3.5 py-1.5 rounded-xl qr-accent-bg text-white font-extrabold text-xs shadow-xs hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                            >
                              Añadir
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }

                // 2. MEDIUM VIEW MODE (Default)
                return (
                  <div
                    key={product.id}
                    style={productCardCustomStyles.hasCustomStyle ? productCardCustomStyles.containerStyle : undefined}
                    className={`p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border transition-all duration-200 flex flex-col justify-between overflow-hidden relative group ${
                      isOutOfStock
                        ? 'opacity-65 border-slate-200 dark:border-slate-800'
                        : 'border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md'
                    }`}
                  >
                    {productCardCustomStyles.overlayStyle && <div style={productCardCustomStyles.overlayStyle} />}
                    <div className="flex gap-3 items-start relative z-10">
                      {/* Product Image Thumbnail */}
                      <div
                        onClick={() => openProductDetail(product)}
                        title="Toca para ver foto ampliada y detalles"
                        className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 relative cursor-pointer group/img border border-slate-100 dark:border-slate-800"
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
                            <span
                              className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block truncate"
                              style={productCardCustomStyles.computedTextColor ? { color: productCardCustomStyles.computedTextColor, opacity: 0.7 } : undefined}
                            >
                              {product.category}
                            </span>
                          </div>
                          <h4
                            onClick={() => openProductDetail(product)}
                            className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white leading-snug cursor-pointer hover:opacity-85 transition-colors line-clamp-2 mt-0.5"
                            style={productCardCustomStyles.computedTextColor ? { color: productCardCustomStyles.computedTextColor } : undefined}
                          >
                            {product.name}
                          </h4>
                          {product.description && (
                            <p
                              className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed font-normal"
                              style={productCardCustomStyles.computedTextColor ? { color: productCardCustomStyles.computedTextColor, opacity: 0.8 } : undefined}
                            >
                              {product.description}
                            </p>
                          )}
                        </div>

                        <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                          <span className="font-mono font-black text-sm sm:text-base qr-accent-text tracking-tight">
                            {formatCOP(product.price)}
                          </span>
                          <span
                            className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold"
                            style={productCardCustomStyles.computedTextColor ? { color: productCardCustomStyles.computedTextColor, opacity: 0.7 } : undefined}
                          >
                            ({resolveProductTax(product, taxRate).shortLabel} incl.)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Bar for Product */}
                    <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between relative z-10">
                      <span
                        className="text-[10px] font-medium opacity-70"
                        style={productCardCustomStyles.computedTextColor ? { color: productCardCustomStyles.computedTextColor } : undefined}
                      >
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
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                              <button
                                type="button"
                                onClick={() => {
                                  const idx = cart.findIndex(c => c.product.id === product.id);
                                  if (idx > -1) handleUpdateCartQuantity(idx, -1);
                                }}
                                className="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-100 text-xs font-bold"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-5 text-center font-bold text-xs">
                                {inCartItem.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddToCart(product)}
                                className="w-6 h-6 rounded-lg qr-accent-bg text-white flex items-center justify-center shadow-xs text-xs font-bold"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveItemForNote(product);
                                  setItemNoteText('');
                                }}
                                disabled={isOutOfStock}
                                title="Añadir nota especial (ej. sin cebolla)"
                                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700/80 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddToCart(product)}
                                disabled={isOutOfStock}
                                className="flex items-center gap-1 px-3.5 py-2 rounded-xl qr-accent-bg text-white font-extrabold text-xs shadow-xs hover:opacity-95 active:scale-95 transition-all cursor-pointer"
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
                          className="text-[11px] font-semibold text-stone-800 dark:text-stone-200 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-2.5 py-1 rounded-md hover:bg-stone-200 transition cursor-pointer"
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

        {/* Banner de Subcuenta QR cuando el restaurante habilita subcuentas */}
        {subaccountsMode !== 'disabled' && canOrder && (
          <div className="p-3.5 rounded-md bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-900 dark:text-rose-300 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {activeSubaccountName
                      ? `Pidiendo como: ${activeSubaccountName}`
                      : subaccountsMode === 'required'
                        ? 'Ingresa tu nombre para pedir en esta mesa'
                        : '¿Quieres pedir con tu propia subcuenta?'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Sin registro ni contraseñas · Cada persona lleva su consumo por separado
                  </p>
                </div>
              </div>
              {activeSubaccountName && (
                <button
                  type="button"
                  onClick={() => setIsSubaccountSwitcherOpen((v) => !v)}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {isSubaccountSwitcherOpen ? 'Listo' : 'Cambiar / Agregar'}
                </button>
              )}
            </div>

            {(!activeSubaccountName || isSubaccountSwitcherOpen) && (
              <div className="space-y-2 pt-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={subaccountNameDraft}
                    onChange={(e) => setSubaccountNameDraft(e.target.value)}
                    placeholder="Tu nombre (ej. Diego, Laura...)"
                    className="flex-1 px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-rose-900/40"
                  />
                  <button
                    type="button"
                    onClick={() => handleSelectOrCreateSubaccount(subaccountNameDraft)}
                    disabled={!subaccountNameDraft.trim()}
                    className="px-3 py-1.5 rounded-md bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                  >
                    Usar nombre
                  </button>
                </div>

                {allowQrSubaccountJoin && tableSubaccounts.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-500">En esta mesa:</span>
                    {tableSubaccounts.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => handleSelectOrCreateSubaccount(sub.displayName, sub)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer transition ${
                          activeSubaccountId === sub.id
                            ? 'bg-rose-900 text-white border-rose-900'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {sub.displayName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Existing Consumption Summary on this Table */}
        {existingItemsCount > 0 && (
          <div className="p-4 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                <div>
                  <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white">
                    {subaccountsMode !== 'disabled' && summaryScope === 'mine' && activeSubaccountName
                      ? `Mi Consumo (${activeSubaccountName})`
                      : `Consumo Acumulado en Mesa ${table.number}`}
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Pendiente total mesa: {formatCOP(subaccountsOverview.tablePendingNetWithTax)}
                    {subaccountsOverview.tablePaidGross > 0
                      ? ` · Ya abonado: ${formatCOP(subaccountsOverview.tablePaidGross)}`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="font-mono font-black text-sm text-stone-900 dark:text-stone-100 block">
                  {formatCOP(
                    subaccountsMode !== 'disabled' && summaryScope === 'mine' && mySubaccountSummary
                      ? mySubaccountSummary.pendingNetWithTax
                      : subaccountsOverview.tablePendingNetWithTax || existingTaxInclusiveTotal
                  )}
                </span>
                <span className="text-[10px] text-slate-400 font-semibold block">
                  (Saldo pendiente)
                </span>
              </div>
            </div>

            {subaccountsMode !== 'disabled' && (activeSubaccountId || subaccountsOverview.subaccounts.length > 0) && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  {activeSubaccountId && (
                    <button
                      type="button"
                      onClick={() => setSummaryScope('mine')}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition ${
                        summaryScope === 'mine'
                          ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Mi cuenta
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSummaryScope('table')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition ${
                      summaryScope === 'table' || !activeSubaccountId
                        ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Toda la mesa
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {subaccountsOverview.subaccounts.map((s) => (
                    <span
                      key={s.subaccountId}
                      className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-700 dark:text-slate-300"
                    >
                      {s.displayName}: {s.pendingNetWithTax <= 0 ? 'Pagada' : formatCOP(s.pendingNetWithTax)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {existingOrder?.items
                .filter((it) => {
                  if (subaccountsMode === 'disabled' || summaryScope === 'table' || !activeSubaccountId) {
                    return true;
                  }
                  if (it.subaccountId === activeSubaccountId) return true;
                  if (it.isShared && it.allocations?.some((a) => a.subaccountId === activeSubaccountId)) {
                    return true;
                  }
                  return false;
                })
                .map((it) => {
                  const itemGross = computeItemTotal(it);
                  const pending = computeItemPendingAmount(it);
                  const myAlloc = it.isShared
                    ? it.allocations?.find((a) => a.subaccountId === activeSubaccountId)
                    : undefined;
                  const displayPrice =
                    summaryScope === 'mine' && myAlloc ? myAlloc.shareAmount : itemGross;
                  const isLinePaid =
                    summaryScope === 'mine' && myAlloc ? Boolean(myAlloc.paid) : pending <= 0;

                  return (
                    <div key={it.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-slate-400 w-5 text-center shrink-0">
                          {it.quantity}x
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {it.name}
                            </span>
                            {it.subaccountName && summaryScope === 'table' && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                {it.subaccountName}
                              </span>
                            )}
                            {myAlloc && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                                Tu parte compartida
                              </span>
                            )}
                            {isLinePaid && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                Pagado
                              </span>
                            )}
                          </div>
                          {it.notes && (
                            <p className="text-[10px] text-stone-500 dark:text-stone-400 italic">
                              Nota: {it.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                        {formatCOP(displayPrice)}
                      </span>
                    </div>
                  );
                })}
            </div>

            {canRequestBill && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setBillScope(subaccountsMode !== 'disabled' && activeSubaccountId ? 'mine' : 'table');
                    setIsRequestBillModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Pedir la Cuenta / Propina y Factura</span>
                </button>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Floating Bottom Sticky Bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 p-3 sm:py-3.5 shadow-xl">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2.5">
          
          {/* If ordering is enabled and there are items in cart */}
          {canOrder && cartItemsCount > 0 ? (
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="flex-1 py-3.5 px-4 rounded-2xl qr-accent-bg text-white font-extrabold text-sm shadow-md flex items-center justify-between hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-white/25 backdrop-blur-xs flex items-center justify-center font-black text-xs text-white">
                  {cartItemsCount}
                </div>
                <span>Ver Mi Pedido ({cartItemsCount})</span>
              </div>
              <span className="font-mono font-black text-base text-white">{formatCOP(cartTaxInclusiveTotal)}</span>
            </button>
          ) : (
            /* If no items in cart or in menuOnly mode: Provide prominent Waiter & Bill buttons */
            <div className="flex-1 grid grid-cols-2 gap-2.5">
              {canCallWaiter && (
                <button
                  type="button"
                  onClick={() => setIsCallWaiterModalOpen(true)}
                  className={`py-3 px-3.5 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer shadow-xs ${
                    isWaiterCurrentlyCalled
                      ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/70 hover:bg-amber-100'
                  }`}
                >
                  <BellRing className="w-4 h-4" />
                  <span className="truncate">{isWaiterCurrentlyCalled ? 'Mesero en camino...' : 'Llamar al Mesero'}</span>
                </button>
              )}

              {canRequestBill && (
                <button
                  type="button"
                  onClick={() => setIsRequestBillModalOpen(true)}
                  className={`py-3 px-3.5 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer shadow-xs ${
                    isBillCurrentlyRequested
                      ? 'bg-purple-100 text-purple-900 border-purple-300 animate-pulse'
                      : 'bg-slate-900 text-white dark:bg-slate-800 border-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span className="truncate">{isBillCurrentlyRequested ? 'Cuenta pedida' : 'Pedir la Cuenta'}</span>
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
              className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 hover:bg-amber-100 transition cursor-pointer shrink-0"
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
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[92vh] overflow-y-auto">
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

            {subaccountsMode !== 'disabled' && activeSubaccountId && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBillScope('mine')}
                  className={`p-2 rounded-md border text-xs font-bold cursor-pointer transition ${
                    billScope === 'mine'
                      ? 'border-stone-900 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Solo mi subcuenta ({activeSubaccountName})
                </button>
                <button
                  type="button"
                  onClick={() => setBillScope('table')}
                  className={`p-2 rounded-md border text-xs font-bold cursor-pointer transition ${
                    billScope === 'table'
                      ? 'border-stone-900 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Toda la mesa
                </button>
              </div>
            )}

            {existingItemsCount > 0 ? (
              <div className="p-3 rounded-md bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-700 dark:text-stone-300">
                    Consumo (Impuestos incl.):
                  </span>
                  <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                    {formatCOP(effectiveBillSubtotalPending)}
                  </span>
                </div>
                {computedTipAmount > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      Propina voluntaria (0% IVA):
                    </span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {formatCOP(computedTipAmount)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-stone-200 dark:border-stone-700">
                  <span className="text-xs font-extrabold text-stone-900 dark:text-stone-100">
                    Total a pagar:
                  </span>
                  <span className="font-mono tabular-nums font-black text-base text-stone-900 dark:text-stone-100">
                    {formatCOP(effectiveBillSubtotalPending + computedTipAmount)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Avisaremos al personal para llevar la cuenta a tu mesa.
              </p>
            )}

            {/* Propina voluntaria Colombia (Ley 1935/2018) */}
            {allowQrVolunteerTip && effectiveBillSubtotalPending > 0 && (
              <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Propina Voluntaria (Opcional)</span>
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">0% impuesto</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTipMode('none')}
                    className={`py-1.5 px-1 rounded text-[11px] font-bold border cursor-pointer ${
                      tipMode === 'none'
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Sin propina
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipMode('suggested')}
                    className={`py-1.5 px-1 rounded text-[11px] font-bold border cursor-pointer ${
                      tipMode === 'suggested'
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {defaultSuggestedTipPercent}%
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipMode('15')}
                    className={`py-1.5 px-1 rounded text-[11px] font-bold border cursor-pointer ${
                      tipMode === '15'
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    15%
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipMode('custom_amt')}
                    className={`py-1.5 px-1 rounded text-[11px] font-bold border cursor-pointer ${
                      tipMode === 'custom_amt' || tipMode === 'custom_pct'
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Otro
                  </button>
                </div>

                {(tipMode === 'custom_amt' || tipMode === 'custom_pct') && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={customTipPercent}
                        onChange={(e) => {
                          setTipMode('custom_pct');
                          setCustomTipPercent(e.target.value);
                        }}
                        placeholder="% ej. 12"
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        min={0}
                        value={customTipAmount}
                        onChange={(e) => {
                          setTipMode('custom_amt');
                          setCustomTipAmount(e.target.value);
                        }}
                        placeholder="$ Monto fijo"
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Datos de a nombre de quién se cobra (Nombre / Razón Social + NIT / Cédula + Correo FE) */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />
                  <span>Datos para cobro / Factura Electrónica</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = !wantsElectronicInvoice;
                    setWantsElectronicInvoice(next);
                    if (next && customerDocType === 'CONSUMIDOR_FINAL') {
                      setCustomerDocType('CC');
                    }
                    setBillRequestError(null);
                  }}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold border transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                    wantsElectronicInvoice
                      ? 'bg-rose-900 text-white border-rose-900 dark:bg-rose-700 dark:border-rose-700'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Mail className="w-3 h-3 shrink-0" />
                  <span>{wantsElectronicInvoice ? 'Factura Electrónica: Sí' : 'Necesito Factura Electrónica'}</span>
                </button>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Nombre completo o Razón Social
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Consumidor Final, tu nombre o empresa..."
                  className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-900/40"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Tipo de documento
                  </label>
                  <select
                    value={customerDocType}
                    onChange={(e) => {
                      const nextType = e.target.value as CustomerDocumentType;
                      setCustomerDocType(nextType);
                      if (nextType === 'CONSUMIDOR_FINAL') {
                        setCustomerDocNumber('');
                      }
                    }}
                    className="w-full px-2.5 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-hidden focus:ring-2 focus:ring-rose-900/40"
                  >
                    <option value="CONSUMIDOR_FINAL">Sin doc. / Final</option>
                    <option value="CC">Cédula (C.C.)</option>
                    <option value="NIT">NIT / Empresa</option>
                    <option value="CE">Cédula Extr. (C.E.)</option>
                    <option value="PAS">Pasaporte</option>
                    <option value="TI">T.I.</option>
                    <option value="PEP">PPT / PEP</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      {customerDocType === 'NIT' ? 'Número de NIT' : 'Número de identificación'}
                    </label>
                    {customerDocType === 'NIT' && calculateColombiaNitDV(customerDocNumber) && (
                      <span className="text-[10px] font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                        DV sugerido: {calculateColombiaNitDV(customerDocNumber)}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={customerDocNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomerDocNumber(val);
                      if (val.trim() && customerDocType === 'CONSUMIDOR_FINAL') {
                        setCustomerDocType(val.includes('-') ? 'NIT' : 'CC');
                      }
                    }}
                    placeholder={
                      DOCUMENT_TYPE_OPTIONS.find((o) => o.value === customerDocType)?.placeholder ||
                      'Ej. 1020304050 o 900123456-7'
                    }
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-900/40"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1">
                  <Mail className="w-3 h-3 text-rose-900 dark:text-rose-400 shrink-0" />
                  <span>
                    Correo electrónico para Factura Electrónica
                    {wantsElectronicInvoice ? ' *' : ' (Opcional)'}
                  </span>
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomerEmail(val);
                    if (val.trim()) setWantsElectronicInvoice(true);
                    if (billRequestError) setBillRequestError(null);
                  }}
                  placeholder="ejemplo@correo.com"
                  className={`w-full px-3 py-2 text-xs rounded-md border bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 ${
                    wantsElectronicInvoice && !customerEmail.trim()
                      ? 'border-rose-500 dark:border-rose-400'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                />
              </div>

              {wantsElectronicInvoice && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Teléfono / WhatsApp (Para facturador)
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Ej. 3001234567"
                      className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Ciudad / Municipio
                    </label>
                    <input
                      type="text"
                      list="qr-colombia-cities"
                      value={customerCity}
                      onChange={(e) => setCustomerCity(e.target.value)}
                      placeholder="Ej. Bogotá D.C., Medellín..."
                      className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                    />
                    <datalist id="qr-colombia-cities">
                      {COLOMBIAN_CITIES_DANE.map((c) => (
                        <option key={c.cityCode} value={c.city} />
                      ))}
                    </datalist>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Dirección fiscal (Para Factura Electrónica DIAN)
                    </label>
                    <input
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="Ej. Calle 90 # 14-20"
                      className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}

              {billRequestError && (
                <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-[11px] font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{billRequestError}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                ¿Cómo prefieres pagar?
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethodChoice('tarjeta')}
                  className={`p-2.5 rounded-md border text-center font-bold text-xs transition cursor-pointer flex flex-col items-center gap-1 ${
                    paymentMethodChoice === 'tarjeta'
                      ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span className="text-[10px]">Tarjeta</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethodChoice('efectivo')}
                  className={`p-2.5 rounded-md border text-center font-bold text-xs transition cursor-pointer flex flex-col items-center gap-1 ${
                    paymentMethodChoice === 'efectivo'
                      ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  <span className="text-[10px]">Efectivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethodChoice('transferencia')}
                  className={`p-2.5 rounded-md border text-center font-bold text-xs transition cursor-pointer flex flex-col items-center gap-1 ${
                    paymentMethodChoice === 'transferencia'
                      ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900'
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
                  className="w-full p-2.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsRequestBillModalOpen(false)}
                className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRequestBill}
                className="px-4 py-2 rounded-md bg-stone-900 hover:bg-stone-800 dark:bg-rose-900 dark:hover:bg-rose-800 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
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
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-lg sm:rounded-lg shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
            
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-rose-950 dark:text-rose-400" />
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Mi Pedido · Mesa {table.number}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer Name / Subaccount Selector */}
            <div className="px-4 pt-3 pb-2.5 border-b border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  <span>
                    {subaccountsMode === 'required'
                      ? 'Tu nombre o subcuenta (Requerido)'
                      : '¿A nombre de quién va el pedido? (Opcional)'}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowCartBillingFields((prev) => !prev)}
                  className="text-[11px] font-bold text-rose-900 dark:text-rose-400 hover:underline cursor-pointer shrink-0"
                >
                  {showCartBillingFields || customerDocNumber || customerEmail
                    ? 'Ocultar Factura Electrónica'
                    : '+ Factura Electrónica / NIT'}
                </button>
              </div>
              <input
                type="text"
                value={activeSubaccountName || customerName}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomerName(val);
                  if (subaccountsMode !== 'disabled') {
                    setActiveSubaccountName(val);
                    if (!activeSubaccountId) setActiveSubaccountId(generateSubaccountId());
                  }
                }}
                placeholder="Ej. Diego, Laura o Razón Social..."
                className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
              />

              {(showCartBillingFields || Boolean(customerDocNumber) || Boolean(customerEmail)) && (
                <div className="space-y-2 pt-0.5">
                  <div className="grid grid-cols-5 gap-2">
                    <select
                      value={customerDocType}
                      onChange={(e) => {
                        const nextType = e.target.value as CustomerDocumentType;
                        setCustomerDocType(nextType);
                        if (nextType === 'CONSUMIDOR_FINAL') setCustomerDocNumber('');
                      }}
                      className="col-span-2 px-2 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold focus:outline-hidden"
                    >
                      <option value="CONSUMIDOR_FINAL">Sin doc.</option>
                      <option value="CC">C.C.</option>
                      <option value="NIT">NIT</option>
                      <option value="CE">C.E.</option>
                      <option value="PAS">Pasaporte</option>
                      <option value="TI">T.I.</option>
                      <option value="PEP">PPT</option>
                    </select>
                    <input
                      type="text"
                      value={customerDocNumber}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomerDocNumber(val);
                        if (val.trim() && customerDocType === 'CONSUMIDOR_FINAL') {
                          setCustomerDocType('CC');
                        }
                      }}
                      placeholder={customerDocType === 'NIT' ? 'NIT ej. 900123456-7' : 'N.° de documento'}
                      className="col-span-3 px-3 py-1.5 text-xs font-mono tabular-nums rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                    />
                  </div>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomerEmail(val);
                      if (val.trim()) setWantsElectronicInvoice(true);
                    }}
                    placeholder="Correo electrónico para Factura Electrónica"
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                  />
                </div>
              )}
            </div>

            {/* Items in Cart */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {cart.map((item, idx) => (
                  <div key={`${item.product.id}-${idx}`} className="py-2.5 flex items-center justify-between gap-3">
                    {/* Item Image Thumbnail */}
                    <div className="w-12 h-12 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700">
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
                        {formatCOP(item.product.price)} c/u (Imp. incl.)
                      </span>
                      {item.notes && (
                        <p className="text-[10px] text-stone-500 dark:text-stone-400 italic truncate">
                          Nota: {item.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleUpdateCartQuantity(idx, -1)}
                        className="w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-bold text-xs text-slate-900 dark:text-white">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateCartQuantity(idx, 1)}
                        className="w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
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
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-700 dark:text-slate-200">Total a pedir:</span>
                  <span className="font-mono font-black text-lg text-rose-950 dark:text-rose-300">
                    {formatCOP(cartTaxInclusiveTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Base gravable: {formatCOP(cartTaxInclusiveTotal - cartTaxAmount)}</span>
                  <span>
                    {cartTaxSummary.summaryLabel}: {formatCOP(cartTaxAmount)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSendOrder}
                className={`w-full py-3 px-4 rounded-md ${theme.accentBg} ${theme.accentHoverBg} font-extrabold text-sm shadow-xs flex items-center justify-center gap-2 transition cursor-pointer`}
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
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-lg p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                Nota para {activeItemForNote.name}
              </h4>
              <button
                onClick={() => setActiveItemForNote(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={3}
              value={itemNoteText}
              onChange={(e) => setItemNoteText(e.target.value)}
              placeholder="Ej. Sin cebolla, término medio, hielo aparte..."
              className="w-full p-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-rose-900/50"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveItemForNote(null)}
                className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  handleAddToCart(activeItemForNote, itemNoteText);
                  setActiveItemForNote(null);
                }}
                className={`px-4 py-1.5 rounded-md ${theme.accentBg} ${theme.accentHoverBg} font-bold text-xs shadow-xs cursor-pointer`}
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
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-lg overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
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
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-stone-900/90 border border-stone-700 backdrop-blur-xs inline-block mb-1">
                  {selectedProductForDetail.category}
                </span>
                <h3 className="text-xl font-black leading-tight drop-shadow-sm">
                  {selectedProductForDetail.name}
                </h3>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
                    Precio unitario (Imp. incl.)
                  </span>
                </div>
                <span className="font-mono font-black text-xl text-stone-900 dark:text-stone-100">
                  {formatCOP(selectedProductForDetail.price)}
                </span>
              </div>

              {selectedProductForDetail.description ? (
                <div>
                  <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Descripción e Ingredientes
                  </h5>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-3 rounded-md border border-slate-100 dark:border-slate-800">
                    {selectedProductForDetail.description}
                  </p>
                </div>
              ) : null}

              {selectedProductForDetail.stock <= 0 ? (
                <div className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold border border-rose-200 dark:border-rose-900 text-center">
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
                      className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Cantidad:
                    </span>
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-md">
                      <button
                        type="button"
                        onClick={() => setDetailQuantity(Math.max(1, detailQuantity - 1))}
                        className="w-7 h-7 rounded-md bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 font-bold shadow-xs hover:bg-slate-50 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center font-bold text-xs text-slate-900 dark:text-white">
                        {detailQuantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDetailQuantity(detailQuantity + 1)}
                        className="w-7 h-7 rounded-md bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 font-bold shadow-xs hover:bg-slate-50 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-md bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-center">
                  <p className="text-xs font-bold text-stone-900 dark:text-stone-100">
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
                className="px-4 py-2.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
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
                  className={`flex-1 py-2.5 px-4 rounded-md ${theme.accentBg} ${theme.accentHoverBg} font-extrabold text-xs shadow-xs flex items-center justify-center gap-2 transition cursor-pointer`}
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
