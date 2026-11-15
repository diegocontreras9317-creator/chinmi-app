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
  ClipboardCheck,
  Package
} from 'lucide-react';
import {
  Supplier,
  PerishableItem,
  SupplierOrderChannel,
  SupplierOrderItem,
  InsumoPresentation
} from '../../types';
import {
  addQuantities,
  formatQuantity,
  normalizeNonNegativeQuantity,
  subtractQuantities
} from '../../utils/quantityPrecision';
import {
  formatPackagingLabel,
  formatPresentationSummary,
  getEffectiveBaseUnit
} from '../../utils/perishableUtils';

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
  'bloques',
  'bandejas',
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
  const [selectedInsumoId, setSelectedInsumoId] = useState<string>('');
  const [selectedPresentationId, setSelectedPresentationId] = useState<string>('');
  const [productQty, setProductQty] = useState<number>(1);
  const [productUnit, setProductUnit] = useState<string>('kg');
  const [productUnitPrice, setProductUnitPrice] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const now = new Date();
    setOrderDate(getLocalDateString(now));
    setOrderTime(getLocalTimeString(now));
    setItems([]);
    setProductName('');
    setSelectedInsumoId('');
    setSelectedPresentationId('');
    setProductQty(1);
    setProductUnit('kg');
    setProductUnitPrice('');
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
    const map = new Map<
      string,
      {
        insumoId?: string;
        name: string;
        defaultUnit: string;
        suggestedQty: number;
        presentations: InsumoPresentation[];
      }
    >();

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
        const presentations = (p.presentations || []).filter(pr => pr.active !== false);
        map.set(key, {
          insumoId: p.id,
          name: p.name.trim(),
          defaultUnit: getEffectiveBaseUnit(p),
          suggestedQty: suggested,
          presentations
        });
      });

    (activeSupplier.suppliesProvided || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(label => {
        const key = label.toLowerCase();
        if (!map.has(key)) {
          const uniqueMatch = perishables.filter(p => p.name.trim().toLowerCase() === key);
          const matchedPantry = uniqueMatch.length === 1 ? uniqueMatch[0] : undefined;
          map.set(key, {
            insumoId: matchedPantry?.id,
            name: label,
            defaultUnit: matchedPantry ? getEffectiveBaseUnit(matchedPantry) : 'unidades',
            suggestedQty: 1,
            presentations: matchedPantry
              ? (matchedPantry.presentations || []).filter(pr => pr.active !== false)
              : []
          });
        }
      });

    return Array.from(map.values());
  }, [activeSupplier, perishables]);

  const selectedManualPantry = useMemo(() => {
    if (!selectedInsumoId) return undefined;
    return perishables.find(p => p.id === selectedInsumoId);
  }, [selectedInsumoId, perishables]);

  const selectedManualPresentations = useMemo(
    () => (selectedManualPantry?.presentations || []).filter(pr => pr.active !== false),
    [selectedManualPantry]
  );

  const effectiveItems = useMemo(() => {
    const base = [...items];
    const cleanName = productName.trim() || selectedManualPantry?.name || '';
    if (cleanName) {
      const pres = selectedPresentationId
        ? selectedManualPresentations.find(pr => pr.id === selectedPresentationId)
        : undefined;
      const qty = productQty > 0 ? productQty : 1;
      const parsedUnitPrice = parseFloat(productUnitPrice);
      const validPrice = !isNaN(parsedUnitPrice) && parsedUnitPrice > 0 ? parsedUnitPrice : undefined;
      base.push({
        id: `soi-inline-${Date.now()}`,
        ...(selectedManualPantry ? { insumoId: selectedManualPantry.id } : {}),
        name: cleanName,
        quantity: qty,
        unit: pres ? formatPackagingLabel(pres.packagingType, qty !== 1) : productUnit,
        ...(pres
          ? {
              presentationId: pres.id,
              presentationName: pres.name,
              packagingType: pres.packagingType,
              contentQty: pres.contentQty,
              contentUnit: pres.contentUnit,
              brand: pres.brand
            }
          : {}),
        ...(validPrice !== undefined
          ? { unitPrice: validPrice, totalPrice: Math.round(validPrice * qty * 100) / 100 }
          : {}),
        received: false,
        receivedQuantity: qty
      });
    }
    return base;
  }, [
    items,
    productName,
    selectedManualPantry,
    selectedPresentationId,
    selectedManualPresentations,
    productQty,
    productUnit,
    productUnitPrice
  ]);

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

  const addCatalogItem = (cat: {
    insumoId?: string;
    name: string;
    defaultUnit: string;
    suggestedQty: number;
    presentations: InsumoPresentation[];
  }) => {
    const clean = cat.name.trim();
    if (!clean) return;
    setError(null);

    const supplierPres =
      cat.presentations.find(pr => pr.supplierId && pr.supplierId === activeSupplier?.id) ||
      cat.presentations.find(pr => pr.isDefault) ||
      cat.presentations[0];

    setItems(prev => {
      const idx = prev.findIndex(
        it =>
          (cat.insumoId && it.insumoId === cat.insumoId) ||
          it.name.toLowerCase() === clean.toLowerCase()
      );
      if (idx > -1) {
        return prev.map((it, i) => {
          if (i !== idx) return it;
          const nextQty = addQuantities(it.quantity, 1);
          return {
            ...it,
            quantity: nextQty,
            receivedQuantity: nextQty,
            ...(it.unitPrice ? { totalPrice: Math.round(it.unitPrice * nextQty * 100) / 100 } : {})
          };
        });
      }
      const qty = normalizeNonNegativeQuantity(cat.suggestedQty);
      const unitLabel = supplierPres
        ? formatPackagingLabel(supplierPres.packagingType, qty !== 1)
        : cat.defaultUnit;
      return [
        ...prev,
        {
          id: `soi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...(cat.insumoId ? { insumoId: cat.insumoId } : {}),
          name: clean,
          quantity: qty,
          unit: unitLabel,
          ...(supplierPres
            ? {
                presentationId: supplierPres.id,
                presentationName: supplierPres.name,
                packagingType: supplierPres.packagingType,
                contentQty: supplierPres.contentQty,
                contentUnit: supplierPres.contentUnit,
                brand: supplierPres.brand
              }
            : {}),
          received: false,
          receivedQuantity: qty
        }
      ];
    });
  };

  const handleSelectManualInsumo = (insumoId: string) => {
    setSelectedInsumoId(insumoId);
    setSelectedPresentationId('');
    if (!insumoId) return;
    const found = perishables.find(p => p.id === insumoId);
    if (!found) return;
    if (!productName.trim()) {
      setProductName(found.name);
    }
    const activePres = (found.presentations || []).filter(pr => pr.active !== false);
    const preferred =
      activePres.find(pr => pr.supplierId && pr.supplierId === activeSupplier?.id) ||
      activePres.find(pr => pr.isDefault) ||
      activePres[0];
    if (preferred) {
      setSelectedPresentationId(preferred.id);
      setProductUnit(formatPackagingLabel(preferred.packagingType, true));
    } else {
      setProductUnit(getEffectiveBaseUnit(found));
    }
  };

  const handleAddManualItem = () => {
    const clean = (productName.trim() || selectedManualPantry?.name || '').trim();
    if (!clean) return;
    const qty = productQty > 0 ? normalizeNonNegativeQuantity(productQty) : 1;
    setError(null);

    const pres = selectedPresentationId
      ? selectedManualPresentations.find(pr => pr.id === selectedPresentationId)
      : undefined;
    const resolvedUnit = pres ? formatPackagingLabel(pres.packagingType, qty !== 1) : productUnit;

    const parsedUnitPrice = parseFloat(productUnitPrice);
    const validPrice = !isNaN(parsedUnitPrice) && parsedUnitPrice > 0 ? parsedUnitPrice : undefined;

    let resolvedInsumoId = selectedInsumoId || undefined;
    if (!resolvedInsumoId) {
      const exactMatches = perishables.filter(
        p => p.name.trim().toLowerCase() === clean.toLowerCase()
      );
      if (exactMatches.length === 1) {
        resolvedInsumoId = exactMatches[0].id;
      }
    }

    setItems(prev => {
      const idx = prev.findIndex(
        it =>
          it.name.toLowerCase() === clean.toLowerCase() &&
          it.unit === resolvedUnit &&
          (it.presentationId || '') === (pres?.id || '')
      );
      if (idx > -1) {
        return prev.map((it, i) => {
          if (i !== idx) return it;
          const nextQty = addQuantities(it.quantity, qty);
          return {
            ...it,
            quantity: nextQty,
            receivedQuantity: nextQty,
            ...(validPrice !== undefined
              ? { unitPrice: validPrice, totalPrice: Math.round(validPrice * nextQty * 100) / 100 }
              : it.unitPrice
              ? { totalPrice: Math.round(it.unitPrice * nextQty * 100) / 100 }
              : {})
          };
        });
      }
      return [
        ...prev,
        {
          id: `soi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...(resolvedInsumoId ? { insumoId: resolvedInsumoId } : {}),
          name: clean,
          quantity: qty,
          unit: resolvedUnit,
          ...(pres
            ? {
                presentationId: pres.id,
                presentationName: pres.name,
                packagingType: pres.packagingType,
                contentQty: pres.contentQty,
                contentUnit: pres.contentUnit,
                brand: pres.brand
              }
            : {}),
          ...(validPrice !== undefined
            ? { unitPrice: validPrice, totalPrice: Math.round(validPrice * qty * 100) / 100 }
            : {}),
          received: false,
          receivedQuantity: qty
        }
      ];
    });

    setProductName('');
    setSelectedInsumoId('');
    setSelectedPresentationId('');
    setProductQty(1);
    setProductUnitPrice('');
  };

  const updateItemQuantity = (id: string, nextQty: number) => {
    if (nextQty <= 0) {
      setItems(prev => prev.filter(it => it.id !== id));
      return;
    }
    const cleanQty = normalizeNonNegativeQuantity(nextQty);
    setItems(prev =>
      prev.map(it => {
        if (it.id !== id) return it;
        return {
          ...it,
          quantity: cleanQty,
          receivedQuantity: cleanQty,
          ...(it.unitPrice ? { totalPrice: Math.round(it.unitPrice * cleanQty * 100) / 100 } : {})
        };
      })
    );
  };

  const updateItemUnit = (id: string, nextUnit: string) => {
    setItems(prev =>
      prev.map(it =>
        it.id === id
          ? {
              ...it,
              unit: nextUnit,
              presentationId: undefined,
              presentationName: undefined,
              packagingType: undefined,
              contentQty: undefined,
              contentUnit: undefined
            }
          : it
      )
    );
  };

  const updateItemPresentation = (id: string, presentationId: string) => {
    setItems(prev =>
      prev.map(it => {
        if (it.id !== id) return it;
        const pantry = it.insumoId ? perishables.find(p => p.id === it.insumoId) : undefined;
        if (!presentationId) {
          return {
            ...it,
            presentationId: undefined,
            presentationName: undefined,
            packagingType: undefined,
            contentQty: undefined,
            contentUnit: undefined,
            unit: pantry ? getEffectiveBaseUnit(pantry) : it.unit
          };
        }
        const pres = (pantry?.presentations || []).find(pr => pr.id === presentationId);
        if (!pres) return it;
        return {
          ...it,
          presentationId: pres.id,
          presentationName: pres.name,
          packagingType: pres.packagingType,
          contentQty: pres.contentQty,
          contentUnit: pres.contentUnit,
          brand: pres.brand,
          unit: formatPackagingLabel(pres.packagingType, it.quantity !== 1)
        };
      })
    );
  };

  const updateItemUnitPrice = (id: string, rawVal: string) => {
    const parsed = parseFloat(rawVal);
    setItems(prev =>
      prev.map(it => {
        if (it.id !== id) return it;
        if (!rawVal.trim() || isNaN(parsed) || parsed <= 0) {
          const { unitPrice: _up, totalPrice: _tp, ...rest } = it;
          return rest;
        }
        return {
          ...it,
          unitPrice: parsed,
          totalPrice: Math.round(parsed * it.quantity * 100) / 100
        };
      })
    );
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
                Guarda presentaciones, empaques y precios opcionales acordados para recibir sin fricción
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
                    it =>
                      (cat.insumoId && it.insumoId === cat.insumoId) ||
                      it.name.toLowerCase() === cat.name.toLowerCase()
                  );
                  return (
                    <button
                      key={`${cat.insumoId || 'sup'}-${cat.name}`}
                      type="button"
                      onClick={() => addCatalogItem(cat)}
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

            {/* Vinculación opcional con Despensa + Presentación */}
            {perishables.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={selectedInsumoId}
                  onChange={e => handleSelectManualInsumo(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-[11px] cursor-pointer"
                >
                  <option value="">-- Vincular a insumo de Despensa (opcional) --</option>
                  {perishables.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({getEffectiveBaseUnit(p)})
                    </option>
                  ))}
                </select>

                {selectedManualPresentations.length > 0 && (
                  <select
                    value={selectedPresentationId}
                    onChange={e => {
                      const val = e.target.value;
                      setSelectedPresentationId(val);
                      const pres = selectedManualPresentations.find(pr => pr.id === val);
                      if (pres) {
                        setProductUnit(formatPackagingLabel(pres.packagingType, productQty !== 1));
                        if (pres.referencePrice && !productUnitPrice) {
                          setProductUnitPrice(String(pres.referencePrice));
                        }
                      } else if (selectedManualPantry) {
                        setProductUnit(getEffectiveBaseUnit(selectedManualPantry));
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 text-slate-800 dark:text-slate-200 font-semibold text-[11px] cursor-pointer"
                  >
                    <option value="">Usar unidad base ({getEffectiveBaseUnit(selectedManualPantry)})</option>
                    {selectedManualPresentations.map(pr => (
                      <option key={pr.id} value={pr.id}>
                        {formatPresentationSummary(pr)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

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
                placeholder="Ej. Pan hamburguesa, Queso mozzarella..."
                className="sm:col-span-4 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-rose-900/30"
              />

              <input
                type="number"
                min="0.01"
                step="any"
                value={productQty}
                onChange={e => setProductQty(parseFloat(e.target.value) || 0)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddManualItem();
                  }
                }}
                className="sm:col-span-2 px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums font-bold text-center"
                title="Cantidad"
              />

              <select
                value={productUnit}
                disabled={Boolean(selectedPresentationId)}
                onChange={e => setProductUnit(e.target.value)}
                className="sm:col-span-2 px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold cursor-pointer disabled:opacity-60"
              >
                {!ORDER_UNITS.includes(productUnit) && (
                  <option value={productUnit}>{productUnit}</option>
                )}
                {ORDER_UNITS.map(u => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="0"
                step="any"
                value={productUnitPrice}
                onChange={e => setProductUnitPrice(e.target.value)}
                placeholder="Precio unit. opc."
                className="sm:col-span-2 px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums text-[11px]"
                title="Precio unitario opcional (COP)"
              />

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
                {items.map(item => {
                  const linkedPantry = item.insumoId
                    ? perishables.find(p => p.id === item.insumoId)
                    : undefined;
                  const itemPresentations = (linkedPantry?.presentations || []).filter(
                    pr => pr.active !== false
                  );

                  return (
                    <div key={item.id} className="px-3 py-2.5 space-y-1.5">
                      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-900 dark:text-white truncate block">
                            {item.name}
                          </span>
                          {item.contentQty && item.contentUnit && (
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                              <Package className="w-3 h-3 shrink-0" />
                              <span>
                                {item.presentationName || formatPackagingLabel(item.packagingType)} ·{' '}
                                {formatQuantity(item.contentQty)} {item.contentUnit} c/u
                                {' · '}Total: {formatQuantity(item.quantity * item.contentQty)}{' '}
                                {item.contentUnit}
                              </span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() =>
                              updateItemQuantity(item.id, subtractQuantities(item.quantity, 1, true))
                            }
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
                            onClick={() =>
                              updateItemQuantity(item.id, addQuantities(item.quantity, 1))
                            }
                            className="w-7 h-7 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>

                          {itemPresentations.length > 0 ? (
                            <select
                              value={item.presentationId || ''}
                              onChange={e => updateItemPresentation(item.id, e.target.value)}
                              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer max-w-[160px]"
                            >
                              <option value="">
                                {linkedPantry ? getEffectiveBaseUnit(linkedPantry) : item.unit} (base)
                              </option>
                              {itemPresentations.map(pr => (
                                <option key={pr.id} value={pr.id}>
                                  {pr.name || formatPackagingLabel(pr.packagingType)} (x{formatQuantity(pr.contentQty)} {pr.contentUnit})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <select
                              value={item.unit}
                              onChange={e => updateItemUnit(item.id, e.target.value)}
                              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
                            >
                              {!ORDER_UNITS.includes(item.unit) && (
                                <option value={item.unit}>{item.unit}</option>
                              )}
                              {ORDER_UNITS.map(u => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          )}

                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.unitPrice ?? ''}
                            onChange={e => updateItemUnitPrice(item.id, e.target.value)}
                            placeholder="$ opc."
                            className="w-20 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono tabular-nums text-[11px] text-slate-800 dark:text-slate-200"
                            title="Precio unitario acordado (opcional)"
                          />

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
                    </div>
                  );
                })}
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
