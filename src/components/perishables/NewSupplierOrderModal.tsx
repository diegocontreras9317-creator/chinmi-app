import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Truck,
  Calendar,
  Clock,
  Plus,
  Minus,
  Trash2,
  PackageCheck,
  Phone,
  AlertTriangle,
  ClipboardCheck
} from 'lucide-react';
import { Supplier, PerishableItem, SupplierOrderChannel, SupplierOrderItem } from '../../types';
import {
  addQuantities,
  formatQuantity,
  normalizeNonNegativeQuantity,
  subtractQuantities
} from '../../utils/quantityPrecision';

interface NewSupplierOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  perishables: PerishableItem[];
  preselectedSupplierId?: string | null;
  onSaveOrder: (payload: {
    supplierId?: string;
    supplierName: string;
    supplierPhone?: string;
    channel: SupplierOrderChannel;
    orderedAt: string;
    items: SupplierOrderItem[];
    notes?: string;
  }) => void;
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

function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalTimeString(date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export const NewSupplierOrderModal: React.FC<NewSupplierOrderModalProps> = ({
  isOpen,
  onClose,
  suppliers,
  perishables,
  preselectedSupplierId = null,
  onSaveOrder
}) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('__manual__');
  const [manualSupplierName, setManualSupplierName] = useState('');
  const [manualSupplierPhone, setManualSupplierPhone] = useState('');
  const [channel, setChannel] = useState<SupplierOrderChannel>('llamada');
  const [orderDate, setOrderDate] = useState<string>(() => getLocalDateString());
  const [orderTime, setOrderTime] = useState<string>(() => getLocalTimeString());

  const [items, setItems] = useState<SupplierOrderItem[]>([]);
  const [productName, setProductName] = useState('');
  const [productQty, setProductQty] = useState<number>(1);
  const [productUnit, setProductUnit] = useState<string>('kg');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const now = new Date();
    setOrderDate(getLocalDateString(now));
    setOrderTime(getLocalTimeString(now));
    setItems([]);
    setProductName('');
    setProductQty(1);
    setProductUnit('kg');
    setNotes('');
    setError(null);

    if (preselectedSupplierId) {
      const found = suppliers.find(s => s.id === preselectedSupplierId);
      if (found) {
        setSelectedSupplierId(found.id);
        setManualSupplierName(found.name);
        setManualSupplierPhone(found.phone);
        setChannel(found.hasWhatsapp === false ? 'llamada' : 'whatsapp');
        return;
      }
    }

    if (suppliers.length > 0) {
      const first = suppliers[0];
      setSelectedSupplierId(first.id);
      setManualSupplierName(first.name);
      setManualSupplierPhone(first.phone);
      setChannel(first.hasWhatsapp === false ? 'llamada' : 'whatsapp');
    } else {
      setSelectedSupplierId('__manual__');
      setManualSupplierName('');
      setManualSupplierPhone('');
      setChannel('llamada');
    }
  }, [isOpen, preselectedSupplierId, suppliers]);

  const activeSupplier = useMemo(() => {
    if (selectedSupplierId === '__manual__') return null;
    return suppliers.find(s => s.id === selectedSupplierId) || null;
  }, [selectedSupplierId, suppliers]);

  const supplierCatalog = useMemo(() => {
    if (!activeSupplier) return [];
    const map = new Map<string, { name: string; defaultUnit: string; suggestedQty: number }>();

    perishables
      .filter(
        p =>
          p.supplierId === activeSupplier.id ||
          (!p.supplierId &&
            p.supplier &&
            p.supplier.trim().toLowerCase() === activeSupplier.name.trim().toLowerCase())
      )
      .forEach(p => {
        const key = p.name.trim().toLowerCase();
        if (!key) return;
        const isLow = p.quantity <= p.minStock;
        const suggested = isLow
          ? Math.max(1, Math.ceil((p.minStock || 1) * 2 - p.quantity))
          : Math.max(1, p.minStock || 2);
        map.set(key, {
          name: p.name.trim(),
          defaultUnit: p.unit || 'kg',
          suggestedQty: suggested
        });
      });

    (activeSupplier.suppliesProvided || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(label => {
        const key = label.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            name: label,
            defaultUnit: 'unidades',
            suggestedQty: 1
          });
        }
      });

    return Array.from(map.values());
  }, [activeSupplier, perishables]);

  const effectiveItems = useMemo(() => {
    const base = [...items];
    if (productName.trim()) {
      base.push({
        id: `soi-inline-${Date.now()}`,
        name: productName.trim(),
        quantity: productQty > 0 ? productQty : 1,
        unit: productUnit,
        received: false,
        receivedQuantity: productQty > 0 ? productQty : 1
      });
    }
    return base;
  }, [items, productName, productQty, productUnit]);

  if (!isOpen) return null;

  const handleSupplierSelectChange = (val: string) => {
    setSelectedSupplierId(val);
    if (val === '__manual__') {
      setManualSupplierName('');
      setManualSupplierPhone('');
      setChannel('llamada');
    } else {
      const sup = suppliers.find(s => s.id === val);
      if (sup) {
        setManualSupplierName(sup.name);
        setManualSupplierPhone(sup.phone);
        setChannel(sup.hasWhatsapp === false ? 'llamada' : 'whatsapp');
      }
    }
  };

  const addCatalogItem = (itemName: string, defaultUnit = 'unidades', suggestedQty = 1) => {
    const clean = itemName.trim();
    if (!clean) return;
    setError(null);
    setItems(prev => {
      const idx = prev.findIndex(it => it.name.toLowerCase() === clean.toLowerCase());
      if (idx > -1) {
        return prev.map((it, i) => {
          if (i !== idx) return it;
          const nextQty = addQuantities(it.quantity, 1);
          return {
            ...it,
            quantity: nextQty,
            receivedQuantity: nextQty
          };
        });
      }
      return [
        ...prev,
        {
          id: `soi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: clean,
          quantity: normalizeNonNegativeQuantity(suggestedQty),
          unit: defaultUnit,
          received: false,
          receivedQuantity: normalizeNonNegativeQuantity(suggestedQty)
        }
      ];
    });
  };

  const handleAddManualItem = () => {
    const clean = productName.trim();
    if (!clean) return;
    const qty = productQty > 0 ? normalizeNonNegativeQuantity(productQty) : 1;
    setError(null);

    setItems(prev => {
      const idx = prev.findIndex(
        it => it.name.toLowerCase() === clean.toLowerCase() && it.unit === productUnit
      );
      if (idx > -1) {
        return prev.map((it, i) => {
          if (i !== idx) return it;
          const nextQty = addQuantities(it.quantity, qty);
          return {
            ...it,
            quantity: nextQty,
            receivedQuantity: nextQty
          };
        });
      }
      return [
        ...prev,
        {
          id: `soi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: clean,
          quantity: qty,
          unit: productUnit,
          received: false,
          receivedQuantity: qty
        }
      ];
    });

    setProductName('');
    setProductQty(1);
  };

  const updateItemQuantity = (id: string, nextQty: number) => {
    if (nextQty <= 0) {
      setItems(prev => prev.filter(it => it.id !== id));
      return;
    }
    const cleanQty = normalizeNonNegativeQuantity(nextQty);
    setItems(prev =>
      prev.map(it =>
        it.id === id ? { ...it, quantity: cleanQty, receivedQuantity: cleanQty } : it
      )
    );
  };

  const updateItemUnit = (id: string, nextUnit: string) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, unit: nextUnit } : it)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedName = activeSupplier ? activeSupplier.name : manualSupplierName.trim();
    const resolvedPhone = activeSupplier ? activeSupplier.phone : manualSupplierPhone.trim();

    if (!resolvedName) {
      setError('Selecciona o escribe el nombre del distribuidor.');
      return;
    }

    if (!orderDate || !orderTime) {
      setError('Indica la fecha y la hora en que se realizó el pedido.');
      return;
    }

    if (effectiveItems.length === 0) {
      setError('Agrega al menos un producto solicitado al distribuidor.');
      return;
    }

    const parsedDate = new Date(`${orderDate}T${orderTime}:00`);
    const orderedAtIso = isNaN(parsedDate.getTime())
      ? new Date().toISOString()
      : parsedDate.toISOString();

    onSaveOrder({
      supplierId: activeSupplier?.id,
      supplierName: resolvedName,
      supplierPhone: resolvedPhone || undefined,
      channel,
      orderedAt: orderedAtIso,
      items: effectiveItems,
      notes: notes.trim() || undefined
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in">
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-850 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-rose-950 text-white flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-base text-slate-900 dark:text-white truncate">
                Registrar Pedido a Distribuidor
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Guarda fecha, hora y detalle solicitado para verificar su llegada completa
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
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Distribuidor y Canal */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-7">
              <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-1">
                <Truck className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />
                <span>Distribuidor / Proveedor *</span>
              </label>
              <select
                value={selectedSupplierId}
                onChange={e => handleSupplierSelectChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold cursor-pointer outline-hidden focus:ring-2 focus:ring-rose-900/30"
              >
                {suppliers.map(sup => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name} ({sup.phone})
                  </option>
                ))}
                <option value="__manual__">+ Escribir otro distribuidor manualmente...</option>
              </select>
            </div>

            <div className="sm:col-span-5">
              <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
                Medio del pedido
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                {(
                  [
                    { id: 'whatsapp', label: 'WhatsApp' },
                    { id: 'llamada', label: 'Llamada' },
                    { id: 'manual', label: 'Presencial' }
                  ] as const
                ).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setChannel(opt.id)}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                      channel === opt.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {selectedSupplierId === '__manual__' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Nombre del distribuidor *
                </label>
                <input
                  type="text"
                  value={manualSupplierName}
                  onChange={e => setManualSupplierName(e.target.value)}
                  placeholder="Ej. Comercializadora Frutícola"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold outline-hidden focus:ring-2 focus:ring-rose-900/30"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>Teléfono (opcional)</span>
                </label>
                <input
                  type="tel"
                  value={manualSupplierPhone}
                  onChange={e => setManualSupplierPhone(e.target.value)}
                  placeholder="Ej. 300 123 4567"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono outline-hidden focus:ring-2 focus:ring-rose-900/30"
                />
              </div>
            </div>
          )}

          {/* 2. Fecha y Hora del Pedido */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />
                <span>Fecha del pedido *</span>
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={e => setOrderDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums font-semibold outline-hidden focus:ring-2 focus:ring-rose-900/30"
              />
            </div>

            <div>
              <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />
                <span>Hora del pedido *</span>
              </label>
              <input
                type="time"
                value={orderTime}
                onChange={e => setOrderTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums font-semibold outline-hidden focus:ring-2 focus:ring-rose-900/30"
              />
            </div>
          </div>

          {/* 3. Catálogo rápido del distribuidor */}
          {supplierCatalog.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Productos de este distribuidor (toca para agregar)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {supplierCatalog.map(cat => {
                  const inOrder = items.find(
                    it => it.name.toLowerCase() === cat.name.toLowerCase()
                  );
                  return (
                    <button
                      key={cat.name}
                      type="button"
                      onClick={() => addCatalogItem(cat.name, cat.defaultUnit, cat.suggestedQty)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                        inOrder
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                      }`}
                    >
                      <span>{inOrder ? `✓ ${cat.name}` : `+ ${cat.name}`}</span>
                      {inOrder && (
                        <span className="font-mono tabular-nums text-[10px] opacity-85">
                          · {formatQuantity(inOrder.quantity)} {inOrder.unit}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Listado de productos solicitados */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <label className="font-bold text-slate-800 dark:text-slate-200 block">
              Productos solicitados *
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="text"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddManualItem();
                  }
                }}
                placeholder="Ej. Papa sabanera, Limón Tahití, Aceite..."
                className="sm:col-span-6 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-rose-900/30"
              />

              <input
                type="number"
                min="0.1"
                step="any"
                value={productQty}
                onChange={e => setProductQty(parseFloat(e.target.value) || 0)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddManualItem();
                  }
                }}
                className="sm:col-span-2 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums font-bold text-center"
              />

              <select
                value={productUnit}
                onChange={e => setProductUnit(e.target.value)}
                className="sm:col-span-2 px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold cursor-pointer"
              >
                {ORDER_UNITS.map(u => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAddManualItem}
                className="sm:col-span-2 px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar</span>
              </button>
            </div>

            {items.length > 0 && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900 overflow-hidden">
                {items.map(item => (
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
                        onClick={() => updateItemQuantity(item.id, subtractQuantities(item.quantity, 1, true))}
                        className="w-7 h-7 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>

                      <input
                        type="number"
                        min="0.000001"
                        step="any"
                        value={item.quantity}
                        onChange={e => updateItemQuantity(item.id, parseFloat(e.target.value) || 0)}
                        className="w-16 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center font-mono tabular-nums font-bold text-slate-900 dark:text-white"
                      />

                      <button
                        type="button"
                        onClick={() => updateItemQuantity(item.id, addQuantities(item.quantity, 1))}
                        className="w-7 h-7 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>

                      <select
                        value={item.unit}
                        onChange={e => updateItemUnit(item.id, e.target.value)}
                        className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
                      >
                        {ORDER_UNITS.map(u => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => setItems(prev => prev.filter(it => it.id !== item.id))}
                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                        title="Quitar producto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. Observaciones */}
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Notas o condiciones acordadas (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej. Acordado para entrega hoy a las 2:00 p.m., pago contra entrega..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-rose-900/30"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-rose-950 hover:bg-rose-900 text-white text-xs font-extrabold shadow-xs transition cursor-pointer whitespace-nowrap"
            >
              Guardar Registro de Pedido
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
