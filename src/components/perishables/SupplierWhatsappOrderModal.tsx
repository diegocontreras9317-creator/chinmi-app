import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  MessageCircle,
  Store,
  MapPin,
  Plus,
  Minus,
  Trash2,
  PackageCheck,
  Copy,
  Check,
  AlertTriangle,
  Edit2,
  Send
} from 'lucide-react';
import { Supplier, PerishableItem } from '../../types';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { defaultAppConfig } from '../../config/appConfig';

interface OrderLineItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

interface SupplierWhatsappOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
  linkedPantryItems?: PerishableItem[];
  initialItems?: Array<{ name: string; quantity: number; unit: string }>;
}

const ORDER_UNITS = [
  'kg',
  'unidades',
  'cajas',
  'paquetes',
  'bolsas',
  'litros',
  'atados',
  'canastas',
  'g',
  'ml',
  'libra'
];

export function normalizeWhatsappPhone(rawPhone: string): string {
  let digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  // Si es celular colombiano de 10 dígitos (ej. 3001234567), anteponer indicativo 57
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }
  return digits;
}

export const SupplierWhatsappOrderModal: React.FC<SupplierWhatsappOrderModalProps> = ({
  isOpen,
  onClose,
  supplier,
  linkedPantryItems = [],
  initialItems = []
}) => {
  const { config, updateConfig, addSupplierOrder } = useApp();
  const { user } = useAuth();

  const resolvedRegisteredName = useMemo(() => {
    if (user?.businessName && user.businessName.trim()) {
      return user.businessName.trim();
    }
    if (config.businessName && config.businessName !== defaultAppConfig.businessName) {
      return config.businessName.trim();
    }
    return config.businessName || 'Mi Restaurante';
  }, [user?.businessName, config.businessName]);

  const resolvedRegisteredAddress = useMemo(() => {
    if (user?.businessAddress && user.businessAddress.trim()) {
      return user.businessAddress.trim();
    }
    if (config.businessAddress && config.businessAddress !== defaultAppConfig.businessAddress) {
      return config.businessAddress.trim();
    }
    return '';
  }, [user?.businessAddress, config.businessAddress]);

  const [localName, setLocalName] = useState(resolvedRegisteredName);
  const [localAddress, setLocalAddress] = useState(resolvedRegisteredAddress);
  const [isEditingLocalInfo, setIsEditingLocalInfo] = useState(false);

  const [orderItems, setOrderItems] = useState<OrderLineItem[]>([]);
  const [customProductName, setCustomProductName] = useState('');
  const [customProductQty, setCustomProductQty] = useState<number>(1);
  const [customProductUnit, setCustomProductUnit] = useState<string>('kg');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [loggedOrderId, setLoggedOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !supplier) return;

    setLocalName(resolvedRegisteredName);
    setLocalAddress(resolvedRegisteredAddress);
    setIsEditingLocalInfo(!resolvedRegisteredAddress);
    setDeliveryNotes('');
    setCustomProductName('');
    setCustomProductQty(1);
    setCustomProductUnit('kg');
    setCopiedMessage(false);
    setLoggedOrderId(null);

    if (initialItems.length > 0) {
      setOrderItems(
        initialItems.map((it, idx) => ({
          id: `init-${idx}-${Date.now()}`,
          name: it.name,
          quantity: it.quantity,
          unit: it.unit
        }))
      );
    } else {
      // Pre-cargar automáticamente insumos de este proveedor que estén en stock bajo, si existen
      const lowStockLinked = linkedPantryItems.filter(p => p.quantity <= p.minStock);
      if (lowStockLinked.length > 0) {
        setOrderItems(
          lowStockLinked.map((p, idx) => {
            const suggestedQty = Math.max(1, Math.ceil((p.minStock || 1) * 2 - p.quantity));
            return {
              id: `low-${idx}-${p.id}`,
              name: p.name,
              quantity: suggestedQty,
              unit: p.unit || 'kg'
            };
          })
        );
      } else {
        setOrderItems([]);
      }
    }
  }, [isOpen, supplier?.id, resolvedRegisteredName, resolvedRegisteredAddress]);

  // Catálogo rápido combinado: lo que provee el proveedor + sus insumos vinculados en despensa
  const supplierCatalog = useMemo(() => {
    if (!supplier) return [];
    const map = new Map<
      string,
      { name: string; defaultUnit: string; isLowStock: boolean; currentStockText?: string; suggestedQty: number }
    >();

    linkedPantryItems.forEach((p) => {
      const key = p.name.trim().toLowerCase();
      if (!key) return;
      const isLow = p.quantity <= p.minStock;
      const suggested = isLow
        ? Math.max(1, Math.ceil((p.minStock || 1) * 2 - p.quantity))
        : Math.max(1, p.minStock || 2);
      map.set(key, {
        name: p.name.trim(),
        defaultUnit: p.unit || 'kg',
        isLowStock: isLow,
        currentStockText: `${p.quantity} ${p.unit}`,
        suggestedQty: suggested
      });
    });

    const rawSupplies = (supplier.suppliesProvided || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    rawSupplies.forEach((label) => {
      const key = label.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          name: label,
          defaultUnit: 'unidades',
          isLowStock: false,
          suggestedQty: 1
        });
      }
    });

    return Array.from(map.values());
  }, [supplier, linkedPantryItems]);

  const addOrIncrementCatalogItem = (
    itemName: string,
    defaultUnit = 'unidades',
    suggestedQty = 1
  ) => {
    const clean = itemName.trim();
    if (!clean) return;
    setOrderItems(prev => {
      const idx = prev.findIndex(it => it.name.toLowerCase() === clean.toLowerCase());
      if (idx > -1) {
        return prev.map((it, i) =>
          i === idx ? { ...it, quantity: Number((it.quantity + 1).toFixed(2)) } : it
        );
      }
      return [
        ...prev,
        {
          id: `ord-sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: clean,
          quantity: suggestedQty,
          unit: defaultUnit
        }
      ];
    });
  };

  const handleAddCustomProduct = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = customProductName.trim();
    if (!clean) return;
    const qty = customProductQty > 0 ? customProductQty : 1;

    setOrderItems(prev => {
      const idx = prev.findIndex(
        it => it.name.toLowerCase() === clean.toLowerCase() && it.unit === customProductUnit
      );
      if (idx > -1) {
        return prev.map((it, i) =>
          i === idx ? { ...it, quantity: Number((it.quantity + qty).toFixed(2)) } : it
        );
      }
      return [
        ...prev,
        {
          id: `ord-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: clean,
          quantity: qty,
          unit: customProductUnit
        }
      ];
    });

    setCustomProductName('');
    setCustomProductQty(1);
  };

  const updateItemQty = (id: string, nextQty: number) => {
    if (nextQty <= 0) {
      setOrderItems(prev => prev.filter(it => it.id !== id));
      return;
    }
    setOrderItems(prev =>
      prev.map(it => (it.id === id ? { ...it, quantity: Number(nextQty.toFixed(2)) } : it))
    );
  };

  const updateItemUnit = (id: string, nextUnit: string) => {
    setOrderItems(prev => prev.map(it => (it.id === id ? { ...it, unit: nextUnit } : it)));
  };

  const removeItem = (id: string) => {
    setOrderItems(prev => prev.filter(it => it.id !== id));
  };

  // Si el usuario dejó escrito un producto en la caja manual sin pulsar "+ Agregar", incluirlo también
  const effectiveItems: OrderLineItem[] = useMemo(() => {
    const base = [...orderItems];
    if (customProductName.trim()) {
      base.push({
        id: 'pending-inline-item',
        name: customProductName.trim(),
        quantity: customProductQty > 0 ? customProductQty : 1,
        unit: customProductUnit
      });
    }
    return base;
  }, [orderItems, customProductName, customProductQty, customProductUnit]);

  const cleanLocalName = localName.trim() || resolvedRegisteredName;
  const cleanLocalAddress = localAddress.trim();

  const whatsappMessage = useMemo(() => {
    if (!supplier) return '';
    const lines: string[] = [
      `Hola *${supplier.name}*, te compartimos el pedido de insumos:`,
      '',
      `*Local:* ${cleanLocalName}`,
      `*Dirección de entrega:* ${cleanLocalAddress || 'Por confirmar'}`
    ];

    lines.push('', '*Listado de productos:*');
    if (effectiveItems.length === 0) {
      lines.push('• (Agrega productos al listado)');
    } else {
      effectiveItems.forEach((it) => {
        lines.push(`• ${it.quantity} ${it.unit} - ${it.name}`);
      });
    }

    if (deliveryNotes.trim()) {
      lines.push('', `*Observaciones:* ${deliveryNotes.trim()}`);
    }

    lines.push('', 'Quedamos atentos a confirmación. ¡Gracias!');
    return lines.join('\n');
  }, [supplier, cleanLocalName, cleanLocalAddress, effectiveItems, deliveryNotes]);

  if (!isOpen || !supplier) return null;

  const normalizedPhone = normalizeWhatsappPhone(supplier.phone);
  const canSend =
    Boolean(normalizedPhone) &&
    effectiveItems.length > 0 &&
    Boolean(cleanLocalName) &&
    Boolean(cleanLocalAddress);

  const whatsappHref = canSend
    ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(whatsappMessage)}`
    : undefined;

  const persistLocalDetailsIfChanged = () => {
    const trimmedName = localName.trim();
    const trimmedAddr = localAddress.trim();
    if (
      (trimmedName && trimmedName !== config.businessName) ||
      trimmedAddr !== config.businessAddress
    ) {
      updateConfig({
        ...(trimmedName ? { businessName: trimmedName } : {}),
        businessAddress: trimmedAddr
      });
    }
    setIsEditingLocalInfo(false);
  };

  const handleCopyMessage = () => {
    navigator.clipboard?.writeText(whatsappMessage).catch(() => {});
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  const recordOrderInHistory = (channel: 'whatsapp' | 'manual') => {
    if (effectiveItems.length === 0) return;
    persistLocalDetailsIfChanged();
    const saved = addSupplierOrder({
      id: loggedOrderId || undefined,
      supplierId: supplier.id.startsWith('temp-') ? undefined : supplier.id,
      supplierName: supplier.name,
      supplierPhone: supplier.phone,
      channel,
      businessName: cleanLocalName,
      businessAddress: cleanLocalAddress || undefined,
      items: effectiveItems.map((it, idx) => ({
        id: it.id === 'pending-inline-item' ? `soi-${Date.now()}-${idx}` : it.id,
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        received: false,
        receivedQuantity: it.quantity
      })),
      notes: deliveryNotes.trim() || undefined,
      orderedAt: new Date().toISOString()
    });
    setLoggedOrderId(saved.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in">
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-emerald-50/60 dark:bg-emerald-950/20 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-base text-slate-900 dark:text-white truncate">
                Pedido por WhatsApp · {supplier.name}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                WhatsApp destino: +{normalizedPhone || supplier.phone}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* 1. Datos registrados del local (Nombre y Dirección de entrega) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />
                <span>Datos del Local en el Pedido</span>
              </span>

              {!isEditingLocalInfo ? (
                <button
                  type="button"
                  onClick={() => setIsEditingLocalInfo(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-900 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Editar datos</span>
                </button>
              ) : (
                cleanLocalAddress && (
                  <button
                    type="button"
                    onClick={persistLocalDetailsIfChanged}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-bold cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    <span>Guardar datos</span>
                  </button>
                )
              )}
            </div>

            {!isEditingLocalInfo && cleanLocalAddress ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                <div className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Nombre del local
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white block truncate mt-0.5">
                    {cleanLocalName}
                  </span>
                </div>
                <div className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Dirección de entrega
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate mt-0.5">
                    {cleanLocalAddress}
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                    <Store className="w-3 h-3 text-slate-400" />
                    <span>Nombre del local *</span>
                  </label>
                  <input
                    type="text"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    placeholder="Ej. Terraza Central"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold outline-hidden focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                    <MapPin className="w-3 h-3 text-rose-600" />
                    <span>Dirección del local *</span>
                  </label>
                  <input
                    type="text"
                    value={localAddress}
                    onChange={(e) => setLocalAddress(e.target.value)}
                    placeholder="Ej. Cra. 43A # 1-50, El Poblado"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium outline-hidden focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600"
                  />
                </div>
                {!cleanLocalAddress && (
                  <p className="sm:col-span-2 text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Ingresa la dirección de tu local; quedará guardada automáticamente para todos tus próximos pedidos.
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 2. Selección rápida de productos que vende este proveedor */}
          {supplierCatalog.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Insumos de este proveedor (toca para agregar)</span>
                </label>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {supplierCatalog.map((catItem) => {
                  const inOrder = orderItems.find(
                    it => it.name.toLowerCase() === catItem.name.toLowerCase()
                  );
                  return (
                    <button
                      key={catItem.name}
                      type="button"
                      onClick={() =>
                        addOrIncrementCatalogItem(
                          catItem.name,
                          catItem.defaultUnit,
                          catItem.suggestedQty
                        )
                      }
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                        inOrder
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : catItem.isLowStock
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800 hover:bg-amber-100'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                      }`}
                    >
                      <span>{inOrder ? `✓ ${catItem.name}` : `+ ${catItem.name}`}</span>
                      {inOrder && (
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-emerald-700 text-white">
                          {inOrder.quantity} {inOrder.unit}
                        </span>
                      )}
                      {!inOrder && catItem.isLowStock && (
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                          · Stock bajo
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Agregar cualquier producto manualmente */}
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <label className="font-bold text-slate-800 dark:text-slate-200 block">
              Agregar producto al listado
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="text"
                value={customProductName}
                onChange={(e) => setCustomProductName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomProduct();
                  }
                }}
                placeholder="Ej. Limón Tahití, Hielo en cubos, Servilletas..."
                className="sm:col-span-6 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600"
              />

              <input
                type="number"
                min="0.1"
                step="any"
                value={customProductQty}
                onChange={(e) => setCustomProductQty(parseFloat(e.target.value) || 0)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomProduct();
                  }
                }}
                className="sm:col-span-2 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-center"
              />

              <select
                value={customProductUnit}
                onChange={(e) => setCustomProductUnit(e.target.value)}
                className="sm:col-span-2 px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold cursor-pointer"
              >
                {ORDER_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleAddCustomProduct()}
                className="sm:col-span-2 px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar</span>
              </button>
            </div>

            {/* Listado de ítems agregados */}
            {orderItems.length > 0 ? (
              <div className="pt-2 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 px-1">
                  <span>Productos en el pedido ({orderItems.length})</span>
                  <button
                    type="button"
                    onClick={() => setOrderItems([])}
                    className="text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    Vaciar lista
                  </button>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900 overflow-hidden">
                  {orderItems.map((item) => (
                    <div
                      key={item.id}
                      className="px-3 py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2"
                    >
                      <span className="font-bold text-slate-900 dark:text-white truncate min-w-0 flex-1">
                        {item.name}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateItemQty(item.id, item.quantity - 1)}
                          className="w-7 h-7 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>

                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItemQty(item.id, parseFloat(e.target.value) || 0)
                          }
                          className="w-16 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center font-mono font-bold text-slate-900 dark:text-white"
                        />

                        <button
                          type="button"
                          onClick={() => updateItemQty(item.id, item.quantity + 1)}
                          className="w-7 h-7 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>

                        <select
                          value={item.unit}
                          onChange={(e) => updateItemUnit(item.id, e.target.value)}
                          className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
                        >
                          {ORDER_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          title="Quitar producto"
                          className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              !customProductName.trim() && (
                <p className="text-[11px] text-slate-400 pt-1">
                  Toca los insumos sugeridos arriba o escribe cualquier producto para armar tu pedido.
                </p>
              )
            )}
          </div>

          {/* 4. Nota opcional y Vista previa del mensaje */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Nota de entrega (opcional)
              </label>
              <textarea
                rows={4}
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="Ej. Entregar antes de las 11:00 a.m. por entrada de cocina, traer factura..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-emerald-600/40"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Vista previa del WhatsApp
                </span>
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 cursor-pointer"
                >
                  {copiedMessage ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-600">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copiar texto</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="w-full p-2.5 rounded-xl bg-emerald-50/50 dark:bg-slate-950 border border-emerald-200/80 dark:border-slate-800 text-[11px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans max-h-28 overflow-y-auto leading-relaxed">
                {whatsappMessage}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer: Envío en 1 solo clic y registro automático con fecha y hora */}
        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {loggedOrderId ? (
              <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>Pedido guardado en el registro con fecha y hora para confirmar cuando llegue.</span>
              </span>
            ) : !cleanLocalAddress ? (
              <span className="text-amber-700 dark:text-amber-400 font-semibold">
                Escribe la dirección de tu local arriba para habilitar el envío.
              </span>
            ) : effectiveItems.length === 0 ? (
              <span>Agrega al menos un producto al listado para enviarlo.</span>
            ) : (
              <span>
                Listo: <strong className="tabular-nums">{effectiveItems.length}</strong> producto(s) · Se registrará con fecha y hora al enviar
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer whitespace-nowrap"
            >
              Cerrar
            </button>

            {effectiveItems.length > 0 && !loggedOrderId && (
              <button
                type="button"
                onClick={() => recordOrderInHistory('manual')}
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition cursor-pointer whitespace-nowrap"
              >
                Solo Registrar Pedido
              </button>
            )}

            {canSend && whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  recordOrderInHistory('whatsapp');
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-xs transition inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar Pedido por WhatsApp</span>
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="px-5 py-2.5 rounded-xl bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-500 text-xs font-extrabold inline-flex items-center gap-2 cursor-not-allowed whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar Pedido por WhatsApp</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
