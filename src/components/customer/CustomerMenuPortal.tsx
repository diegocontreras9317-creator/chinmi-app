import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Product, Table, OrderItem, CustomerBillingInfo, CustomerDocumentType } from '../../types';
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
  resolveOrderItemTax,
  resolveProductTax
} from '../../utils/taxes';
import { auth, db } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';
import {
  subscribeUserMenu,
  subscribeUserTables,
  subscribeUserQrConfig,
  saveTableToFirestore,
  sanitizeForFirestore
} from '../../services/firestoreUserStorage';
import { formatCOP } from '../../utils/currency';
import { ChinmiLogo } from '../common/ChinmiLogo';
import { CategoryScrollBar } from '../common/CategoryScrollBar';
import { QR_THEMES, QrThemeId } from '../../config/qrThemes';
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
      const unsubTables = subscribeUserTables(urlUid, (tbls) => {
        const found = tbls.find(t => t.id === urlMesa) || null;
        setQrTable(found);
      });
      const unsubQrSettings = subscribeUserQrConfig(urlUid, (settings) => {
        if (settings) {
          setFirestoreQrSettings(settings);
        }
      });
      return () => {
        unsubMenu();
        unsubTables();
        unsubQrSettings();
      };
    } else {
      setIsQrLoading(false);
    }
  }, [urlUid, urlMesa]);

  const activeTable = qrTable || tables.find(t => t.id === urlMesa || t.id === tableId) || null;
  const activeProducts = qrMenuProducts.length > 0 ? qrMenuProducts : products;

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

  const [menuViewMode, setMenuViewMode] = useState<'list' | 'medium'>(() => {
    return qrSettings.menuViewMode === 'list' ? 'list' : 'medium';
  });

  useEffect(() => {
    if (qrSettings.menuViewMode) {
      setMenuViewMode(qrSettings.menuViewMode);
    }
  }, [qrSettings.menuViewMode]);

  const categoriesList = useMemo(() => {
    const base = config.categories && config.categories.length > 0 ? config.categories : [
      'Todas las categorías',
      'Cervezas & Vinos',
      'Bebidas & Refrescos',
      'Tapas & Entrantes',
      'Platos Principales',
      'Cafés & Postres',
      'Licores & Cócteles'
    ];
    if (!base.includes('Todas las categorías')) {
      return ['Todas las categorías', ...base];
    }
    return base;
  }, [config.categories]);

  const [selectedCategory, setSelectedCategory] = useState<string>('Todas las categorías');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const billingStorageKey = `chinmi_qr_billing_${urlMesa || tableId || 'default'}`;

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

  // Hydrate from active order billing info if local fields are empty
  useEffect(() => {
    const orderBilling = table?.order?.billingInfo || table?.waiterCall?.billingInfo;
    if (!orderBilling) return;
    if (!customerName && orderBilling.customerName && orderBilling.customerName !== 'Consumidor Final') {
      setCustomerName(orderBilling.customerName);
    }
    if (!customerDocNumber && orderBilling.documentNumber) {
      setCustomerDocNumber(orderBilling.documentNumber);
      if (orderBilling.documentType && orderBilling.documentType !== 'CONSUMIDOR_FINAL') {
        setCustomerDocType(orderBilling.documentType);
      }
    }
    if (!customerEmail && orderBilling.email) {
      setCustomerEmail(orderBilling.email);
      setWantsElectronicInvoice(true);
    }
    if (!customerPhone && orderBilling.phone) {
      setCustomerPhone(orderBilling.phone);
    }
    if (!customerCity && orderBilling.city) {
      setCustomerCity(orderBilling.city);
    }
    if (!customerAddress && orderBilling.address) {
      setCustomerAddress(orderBilling.address);
    }
  }, [
    table?.order?.id,
    table?.order?.billingInfo?.documentNumber,
    table?.order?.billingInfo?.email,
    table?.waiterCall?.requestedAt
  ]);

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
    return activeProducts.filter(p => {
      const matchesCat = selectedCategory === 'Todas las categorías' || p.category === selectedCategory;
      const matchesQuery = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (p.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesQuery;
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

  // Existing table order totals (Precios P.V.P con impuesto incluido)
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
    setPortalErrorMsg(null);

    // 1. Obtener restId desde URL o fallback a usuario autenticado
    const targetUid = urlUid || auth.currentUser?.uid;
    if (!targetUid) {
      setPortalErrorMsg('No se encontró el identificador del restaurante en el enlace QR.');
      return;
    }

    const nowIso = new Date().toISOString();
    const existingOrder = table.order;
    const orderId = existingOrder?.id || `ord-${Date.now()}`;

    const cleanCartEmail = customerEmail.trim().toLowerCase();
    if (cleanCartEmail && !isValidEmailFormat(cleanCartEmail)) {
      setPortalErrorMsg('Por favor ingresa un correo electrónico válido para la factura electrónica.');
      return;
    }

    const candidateBilling: Partial<CustomerBillingInfo> = {
      customerName: customerName.trim(),
      documentType: customerDocType,
      documentNumber: customerDocNumber.trim(),
      email: cleanCartEmail,
      phone: customerPhone.trim(),
      city: customerCity.trim(),
      address: customerAddress.trim(),
      requiresElectronicInvoice: Boolean(wantsElectronicInvoice || cleanCartEmail)
    };
    const resolvedBilling: CustomerBillingInfo | null = hasCustomBillingData(candidateBilling)
      ? normalizeBillingInfo(candidateBilling)
      : existingOrder?.billingInfo || null;

    const effectiveCustomerLabel =
      customerName.trim() ||
      (resolvedBilling?.customerName && resolvedBilling.customerName !== 'Consumidor Final'
        ? resolvedBilling.customerName
        : '');

    // Sanitización exhaustiva del array de productos para que NINGÚN campo sea undefined
    const cleanNewItems: OrderItem[] = cart.map(c => {
      const resolvedProdTax = resolveProductTax(c.product, taxRate);
      return {
        id: `it-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        productId: c.product.id || '',
        name: c.product.name || 'Producto',
        unitPrice: Number(c.product.price) || 0,
        quantity: Number(c.quantity) || 1,
        notes: c.notes?.trim() || '',
        addedAt: nowIso,
        customerName: effectiveCustomerLabel,
        orderedBy: 'cliente',
        taxType: resolvedProdTax.taxType,
        taxRate: resolvedProdTax.taxRate
      };
    });

    // Limpiar también cualquier item preexistente para garantizar que no arrastre undefined
    const cleanExistingItems: OrderItem[] = (existingOrder?.items || []).map(it => {
      const resolvedItemTax = resolveOrderItemTax(
        it as unknown as Partial<OrderItem> & Record<string, unknown>,
        activeProducts,
        taxRate
      );
      return {
        id: it.id || `it-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        productId: it.productId || '',
        name: it.name || 'Producto',
        unitPrice: Number(it.unitPrice) || 0,
        quantity: Number(it.quantity) || 1,
        notes: it.notes?.trim() || '',
        addedAt: it.addedAt || nowIso,
        customerName: it.customerName?.trim() || effectiveCustomerLabel,
        orderedBy: it.orderedBy || 'cliente',
        taxType: resolvedItemTax.taxType,
        taxRate: resolvedItemTax.taxRate
      };
    });

    const cleanAllItems = [...cleanExistingItems, ...cleanNewItems];

    // Construcción del objeto de pedido con valores por defecto para campos opcionales
    const rawOrderPayload = {
      id: orderId,
      tableId: table.id || '',
      tableName: table.name || 'Barra',
      items: cleanAllItems,
      productos: cleanAllItems,
      status: 'activa',
      estado: 'activa',
      closed: false,
      discountPercent: Number(existingOrder?.discountPercent) || 0,
      taxPercent: Number(existingOrder?.taxPercent) || 8,
      tipAmount: Number(existingOrder?.tipAmount) || 0,
      openedAt: existingOrder?.openedAt || nowIso,
      lastUpdatedAt: nowIso,
      userId: targetUid || '',
      customerName: effectiveCustomerLabel,
      nombreCliente: effectiveCustomerLabel,
      cliente: effectiveCustomerLabel,
      billingInfo: resolvedBilling,
      comentario: '',
      mesa: table.name || 'Barra'
    };

    const sanitizedOrderPayload = sanitizeForFirestore(rawOrderPayload);

    const rawTablePayload = {
      id: table.id || '',
      number: Number(table.number) || 1,
      name: table.name || 'Mesa',
      seats: Number(table.seats) || 2,
      zone: table.zone || 'Salón Principal',
      status: 'ocupada',
      order: sanitizedOrderPayload,
      updatedAt: nowIso,
      userId: targetUid || '',
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

    try {
      await setDoc(doc(db, 'users', targetUid, 'pedidos', sanitizedOrderPayload.id), sanitizedOrderPayload, { merge: true });
      await setDoc(doc(db, 'users', targetUid, 'mesas', table.id), sanitizedTablePayload, { merge: true });

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
    setPortalErrorMsg(null);
    setBillRequestError(null);

    const cleanBillEmail = customerEmail.trim().toLowerCase();
    if (wantsElectronicInvoice && !cleanBillEmail) {
      setBillRequestError('Ingresa tu correo electrónico para enviarte la Factura Electrónica.');
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
      customerName: customerName.trim(),
      documentType: customerDocType,
      documentNumber: customerDocNumber.trim(),
      email: cleanBillEmail,
      phone: customerPhone.trim(),
      city: customerCity.trim(),
      address: customerAddress.trim(),
      requiresElectronicInvoice: Boolean(wantsElectronicInvoice || cleanBillEmail)
    };
    const hasBilling = hasCustomBillingData(candidateBilling);
    const normalizedBilling = hasBilling
      ? normalizeBillingInfo(candidateBilling)
      : table.order?.billingInfo || undefined;

    const docSummary = normalizedBilling
      ? formatCustomerDocument(normalizedBilling.documentType, normalizedBilling.documentNumber)
      : '';
    const emailSummary = normalizedBilling?.email ? ` · Correo FE: ${normalizedBilling.email}` : '';
    const billingText =
      normalizedBilling && hasCustomBillingData(normalizedBilling)
        ? ` · Cobrar a: ${normalizedBilling.customerName}${docSummary ? ` (${docSummary})` : ''}${emailSummary}`
        : '';

    const nowIso = new Date().toISOString();
    const msg = `Mesa ${table.number} solicita la cuenta. Método: ${methodText}${billingText}`;

    const nextOrder = table.order
      ? {
          ...table.order,
          ...(normalizedBilling
            ? {
                customerName: normalizedBilling.customerName,
                nombreCliente: normalizedBilling.customerName,
                billingInfo: normalizedBilling
              }
            : {}),
          lastUpdatedAt: nowIso
        }
      : table.order;

    const updatedTable: Table = {
      ...table,
      status: 'cuenta',
      updatedAt: nowIso,
      order: nextOrder,
      waiterCall: {
        type: 'bill',
        requestedAt: nowIso,
        message: msg,
        preferredPaymentMethod: paymentMethodChoice,
        ...(normalizedBilling ? { billingInfo: normalizedBilling } : {})
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

    callWaiter(table.id, 'bill', msg, {
      billingInfo: normalizedBilling,
      preferredPaymentMethod: paymentMethodChoice
    });

    setIsRequestBillModalOpen(false);
    setBillRequestSuccess(
      `¡Cuenta solicitada! ${
        normalizedBilling && hasCustomBillingData(normalizedBilling)
          ? `A nombre de ${normalizedBilling.customerName}${docSummary ? ` (${docSummary})` : ''}${
              normalizedBilling.email ? ` · FE a ${normalizedBilling.email}` : ''
            } · `
          : ''
      }Pago: ${methodText}.`
    );
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

  const isWaiterCurrentlyCalled = table.waiterCall?.type === 'waiter';
  const isBillCurrentlyRequested = table.status === 'cuenta' || table.waiterCall?.type === 'bill';

  const bgImage = firestoreQrSettings?.bgImageUrl || qrSettings.bgImageUrl;
  const customTextColor = firestoreQrSettings?.textColor || qrSettings.textColor || '';
  const customAccentColor = firestoreQrSettings?.accentColor || qrSettings.accentColor || '#e11d48';

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
        .qr-accent-bg { background-color: ${customAccentColor} !important; }
        .qr-accent-text { color: ${customAccentColor} !important; }
        .qr-accent-border { border-color: ${customAccentColor} !important; }
      `}</style>
      
      {/* Brand & Table Header */}
      <header className={`sticky top-0 z-30 ${theme.headerBg} backdrop-blur border-b ${theme.headerBorder} shadow-xs`}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <ChinmiLogo size="md" variant="icon" logoUrl={config.logoUrl} />
            <div>
              <h1 className={`font-extrabold text-sm sm:text-base leading-tight ${theme.textClass} flex items-center gap-1.5`}>
                <span>{config.businessName}</span>
              </h1>
              <div className="flex items-center gap-1.5 text-xs opacity-90">
                <span className={`font-bold ${theme.accentText}`}>
                  📍 Mesa {table.number}
                </span>
                <span>·</span>
                <span>{table.zone}</span>
                <span>·</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${theme.badgeBg}`}>
                  Impuestos incl.
                </span>
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

            {onExit && (
              <button
                type="button"
                onClick={handleExitPortal}
                title="Volver al panel principal"
                className="p-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer opacity-70 hover:opacity-100 ml-1"
              >
                <X className="w-4 h-4" />
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
        <div className={`${theme.cardBg} p-4 rounded-md border ${theme.cardBorder} shadow-xs space-y-3`}>
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 opacity-50 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar platos, bebidas, cócteles o ingredientes..."
              className={`w-full pl-9 pr-4 py-2.5 text-xs rounded-md ${theme.cardBg} border ${theme.cardBorder} ${theme.textClass} placeholder:opacity-50 focus:outline-hidden focus:ring-2 focus:ring-rose-900/50`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 p-1"
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
            activeClass={theme.categoryActiveBg}
            inactiveClass={`${theme.cardBg} ${theme.cardBorder} border ${theme.textClass} opacity-80 hover:opacity-100`}
          />
        </div>

        {/* Products List & View Mode Switcher */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 flex-wrap gap-2">
            <h3 className={`font-extrabold text-sm ${theme.textClass} flex items-center gap-1.5`}>
              <span>{selectedCategory}</span>
              <span className="text-xs opacity-60 font-normal">
                ({filteredProducts.length} {filteredProducts.length === 1 ? 'producto' : 'productos'})
              </span>
            </h3>

            {/* View Mode Selector */}
            <div className="flex items-center gap-1 bg-slate-200/60 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px]">
              {(['list', 'medium'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setMenuViewMode(mode)}
                  className={`px-3 py-1 rounded-md font-bold transition cursor-pointer capitalize ${
                    menuViewMode === mode
                      ? `${theme.accentBg} text-white shadow-xs`
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
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
                  ? 'space-y-2'
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
                      className={`p-2.5 sm:p-3 rounded-md ${theme.cardBg} border transition flex items-center justify-between gap-3 ${
                        isOutOfStock ? 'opacity-65 border-slate-200 dark:border-slate-800' : `${theme.cardBorder} shadow-xs ${theme.cardHoverBorder}`
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          onClick={() => openProductDetail(product)}
                          className="w-14 h-14 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 relative cursor-pointer border border-slate-200/60 dark:border-slate-700/60"
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
                            className={`font-bold text-xs sm:text-sm ${theme.textClass} truncate cursor-pointer hover:opacity-80`}
                          >
                            {product.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`font-mono font-bold text-xs ${theme.priceText}`}>
                              {formatCOP(product.price)}
                            </span>
                            <span className="text-[10px] opacity-60">({resolveProductTax(product, taxRate).shortLabel} incl.)</span>
                          </div>
                        </div>
                      </div>

                      {canOrder && (
                        <div className="shrink-0">
                          {inCartItem ? (
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-md border border-slate-200 dark:border-slate-700">
                              <button
                                type="button"
                                onClick={() => {
                                  const idx = cart.findIndex(c => c.product.id === product.id);
                                  if (idx > -1) handleUpdateCartQuantity(idx, -1);
                                }}
                                className="w-5 h-5 rounded bg-white dark:bg-slate-700 flex items-center justify-center text-xs"
                              >
                                -
                              </button>
                              <span className="w-4 text-center font-bold text-xs">{inCartItem.quantity}</span>
                              <button
                                type="button"
                                onClick={() => handleAddToCart(product)}
                                className={`w-5 h-5 rounded ${theme.accentBg} text-white flex items-center justify-center text-xs`}
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddToCart(product)}
                              disabled={isOutOfStock}
                              className={`px-3 py-1.5 rounded-md ${theme.accentBg} font-bold text-xs shadow-xs disabled:opacity-40 cursor-pointer`}
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
                    className={`p-3 sm:p-3.5 rounded-md ${theme.cardBg} border transition flex flex-col justify-between overflow-hidden relative group ${
                      isOutOfStock
                        ? 'opacity-65 border-slate-200 dark:border-slate-800'
                        : `${theme.cardBorder} shadow-xs ${theme.cardHoverBorder}`
                    }`}
                  >
                    <div className="flex gap-3 items-start">
                      {/* Product Image Thumbnail */}
                      <div
                        onClick={() => openProductDetail(product)}
                        title="Toca para ver foto ampliada y detalles"
                        className="w-24 h-24 sm:w-28 sm:h-28 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 relative cursor-pointer group/img border border-slate-200/60 dark:border-slate-700/60"
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
                            <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider block truncate">
                              {product.category}
                            </span>
                          </div>
                          <h4
                            onClick={() => openProductDetail(product)}
                            className={`font-bold text-sm text-slate-900 dark:text-white leading-snug cursor-pointer hover:opacity-80 transition-colors line-clamp-2 mt-0.5`}
                          >
                            {product.name}
                          </h4>
                          {product.description && (
                            <p className="text-xs opacity-75 mt-1 line-clamp-2 leading-relaxed">
                              {product.description}
                            </p>
                          )}
                        </div>

                        <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                          <span className={`font-mono font-black text-sm sm:text-base qr-accent-text`}>
                            {formatCOP(product.price)}
                          </span>
                          <span className="text-[10px] opacity-70 font-semibold">
                            ({resolveProductTax(product, taxRate).shortLabel} incl.)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Bar for Product */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                      <span className="text-[10px] font-medium opacity-70">
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
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-md border border-slate-200 dark:border-slate-700">
                              <button
                                type="button"
                                onClick={() => {
                                  const idx = cart.findIndex(c => c.product.id === product.id);
                                  if (idx > -1) handleUpdateCartQuantity(idx, -1);
                                }}
                                className="w-6 h-6 rounded-md bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-100"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-5 text-center font-bold text-xs">
                                {inCartItem.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddToCart(product)}
                                className={`w-6 h-6 rounded-md qr-accent-bg flex items-center justify-center shadow-xs`}
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
                                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddToCart(product)}
                                disabled={isOutOfStock}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-md qr-accent-bg disabled:bg-slate-200 dark:disabled:bg-slate-800 font-bold text-xs shadow-xs transition cursor-pointer`}
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

        {/* Existing Consumption Summary on this Table */}
        {existingItemsCount > 0 && (
          <div className="p-4 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                <div>
                  <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white">
                    Consumo Acumulado en Mesa {table.number}
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Base gravable: {formatCOP(existingTaxInclusiveTotal - existingTaxAmount)} ·{' '}
                    {existingTaxSummary.summaryLabel}: {formatCOP(existingTaxAmount)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="font-mono font-black text-sm text-stone-900 dark:text-stone-100 block">
                  {formatCOP(existingTaxInclusiveTotal)}
                </span>
                <span className="text-[10px] text-slate-400 font-semibold block">
                  (Total a pagar)
                </span>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {existingOrder?.items.map((it) => {
                const itemUnitPrice = Number(it.unitPrice) || 0;
                return (
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
                          <p className="text-[10px] text-stone-500 dark:text-stone-400 italic">
                            Nota: {it.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {formatCOP(itemUnitPrice * it.quantity)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Billing attribution preview & Request Bill Button in summary */}
            {(hasCustomBillingData(existingOrder?.billingInfo) || hasCustomBillingData(table.waiterCall?.billingInfo)) && (() => {
              const activeBillInfo = table.waiterCall?.billingInfo || existingOrder?.billingInfo;
              const docStr = formatCustomerDocument(activeBillInfo?.documentType, activeBillInfo?.documentNumber);
              return (
                <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Datos registrados para cobro / factura
                    </span>
                    <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {activeBillInfo?.customerName || 'Consumidor Final'}
                      {docStr ? ` · ${docStr}` : ''}
                      {activeBillInfo?.email ? ` · ${activeBillInfo.email}` : ''}
                    </p>
                  </div>
                  {canRequestBill && (
                    <button
                      type="button"
                      onClick={() => setIsRequestBillModalOpen(true)}
                      className="text-[11px] font-bold text-rose-900 dark:text-rose-300 hover:underline shrink-0 cursor-pointer"
                    >
                      Cambiar
                    </button>
                  )}
                </div>
              );
            })()}

            {canRequestBill && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsRequestBillModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Pedir la Cuenta / Datos de Factura</span>
                </button>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Floating Bottom Sticky Bar */}
      <div className={`fixed bottom-0 inset-x-0 z-40 ${theme.headerBg} backdrop-blur border-t ${theme.headerBorder} p-3 shadow-lg`}>
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2.5">
          
          {/* If ordering is enabled and there are items in cart */}
          {canOrder && cartItemsCount > 0 ? (
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className={`flex-1 py-3 px-4 rounded-md ${theme.floatingBarBg} ${theme.floatingBarText} font-extrabold text-sm shadow-xs flex items-center justify-between transition cursor-pointer`}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs">
                  {cartItemsCount}
                </div>
                <span>Ver Mi Pedido ({cartItemsCount})</span>
              </div>
              <span className="font-mono font-black">{formatCOP(cartTaxInclusiveTotal)}</span>
            </button>
          ) : (
            /* If no items in cart or in menuOnly mode: Provide prominent Waiter & Bill buttons */
            <div className="flex-1 grid grid-cols-2 gap-2">
              {canCallWaiter && (
                <button
                  type="button"
                  onClick={() => setIsCallWaiterModalOpen(true)}
                  className={`py-2.5 px-3 rounded-md font-bold text-xs flex items-center justify-center gap-1.5 border transition cursor-pointer shadow-xs ${
                    isWaiterCurrentlyCalled
                      ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/70 hover:bg-amber-100'
                  }`}
                >
                  <BellRing className="w-4 h-4" />
                  <span>{isWaiterCurrentlyCalled ? 'Mesero en camino...' : 'Llamar al Mesero'}</span>
                </button>
              )}

              {canRequestBill && (
                <button
                  type="button"
                  onClick={() => setIsRequestBillModalOpen(true)}
                  className={`py-2.5 px-3 rounded-md font-bold text-xs flex items-center justify-center gap-1.5 border transition cursor-pointer shadow-xs ${
                    isBillCurrentlyRequested
                      ? 'bg-stone-200 text-stone-900 border-stone-400 animate-pulse'
                      : 'bg-stone-900 text-white border-stone-800 hover:bg-stone-800'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{isBillCurrentlyRequested ? 'Cuenta pedida' : 'Pedir la Cuenta'}</span>
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

            {existingItemsCount > 0 ? (
              <div className="p-3 rounded-md bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                    Total a pagar:
                  </span>
                  <span className="font-mono tabular-nums font-black text-base text-stone-900 dark:text-stone-100">
                    {formatCOP(existingTaxInclusiveTotal)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Incluye base gravable ({formatCOP(existingTaxInclusiveTotal - existingTaxAmount)}) ·{' '}
                  {existingTaxSummary.summaryLabel}: {formatCOP(existingTaxAmount)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Avisaremos al personal para llevar la cuenta a tu mesa.
              </p>
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

            {/* Customer Name & Optional Tax ID (NIT / Cédula) + Email FE Input */}
            <div className="px-4 pt-3 pb-2.5 border-b border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  <span>¿A nombre de quién va el pedido / cobro? (Opcional)</span>
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
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ej. Juan Pérez o Razón Social..."
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
