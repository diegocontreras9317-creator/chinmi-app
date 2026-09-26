import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, AlertTriangle, Package, MapPin, Truck, Hash, DollarSign, Image as ImageIcon, Sparkles, Upload, Camera, RefreshCw } from 'lucide-react';
import { PerishableItem, PerishableCategory, MeasurementUnit } from '../../types';
import { PERISHABLE_CATEGORIES, MEASUREMENT_UNITS, STORAGE_LOCATIONS, calculateDaysRemaining } from '../../utils/perishableUtils';
import { formatCOP } from '../../utils/currency';
import { compressImageFile } from '../../utils/imageCompressor';

interface NewPerishableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Omit<PerishableItem, 'id'>) => void;
  editingItem?: PerishableItem | null;
}

const PRESET_IMAGES: Record<string, string> = {
  'Limón': 'https://images.unsplash.com/photo-1590502593747-42a996133562?auto=format&fit=crop&w=400&q=80',
  'Menta / Hierbas': 'https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?auto=format&fit=crop&w=400&q=80',
  'Naranjas': 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&w=400&q=80',
  'Tomates': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80',
  'Aguacates': 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=400&q=80',
  'Lechuga': 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?auto=format&fit=crop&w=400&q=80',
  'Fresas': 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?auto=format&fit=crop&w=400&q=80',
  'Quesos': 'https://images.unsplash.com/photo-1589881133595-a3c085cb731d?auto=format&fit=crop&w=400&q=80',
  'Carnes': 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=400&q=80',
  'Cilantro': 'https://images.unsplash.com/photo-1599818815124-7cb691060933?auto=format&fit=crop&w=400&q=80',
};

const getTodayIso = () => new Date().toISOString().split('T')[0];
const getDefaultExpiryIso = () => {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  return d.toISOString().split('T')[0];
};

export const NewPerishableModal: React.FC<NewPerishableModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingItem
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PerishableCategory>('Verduras & Hortalizas');
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<MeasurementUnit>('kg');
  const [minStock, setMinStock] = useState<number>(2);
  const [entryDate, setEntryDate] = useState<string>(getTodayIso());
  const [expiryDate, setExpiryDate] = useState<string>(getDefaultExpiryIso());
  const [location, setLocation] = useState<string>(STORAGE_LOCATIONS[0]);
  const [supplier, setSupplier] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [costPerUnit, setCostPerUnit] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [alarmDaysBeforeExpiry, setAlarmDaysBeforeExpiry] = useState<number>(3);
  const [error, setError] = useState<string | null>(null);

  // Custom Category and Custom Location states
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [isCustomLocation, setIsCustomLocation] = useState(false);
  const [customLocation, setCustomLocation] = useState('');

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);

      const isPresetCat = PERISHABLE_CATEGORIES.includes(editingItem.category as any);
      if (isPresetCat) {
        setCategory(editingItem.category);
        setIsCustomCategory(false);
        setCustomCategory('');
      } else {
        setCategory(editingItem.category);
        setIsCustomCategory(true);
        setCustomCategory(editingItem.category);
      }

      setQuantity(editingItem.quantity);
      setUnit(editingItem.unit);
      setMinStock(editingItem.minStock);
      setEntryDate(editingItem.entryDate);
      setExpiryDate(editingItem.expiryDate);

      const isPresetLoc = STORAGE_LOCATIONS.includes(editingItem.location);
      if (isPresetLoc) {
        setLocation(editingItem.location);
        setIsCustomLocation(false);
        setCustomLocation('');
      } else {
        setLocation(editingItem.location);
        setIsCustomLocation(true);
        setCustomLocation(editingItem.location);
      }

      setSupplier(editingItem.supplier || '');
      setBatchNumber(editingItem.batchNumber || '');
      setCostPerUnit(editingItem.costPerUnit || 0);
      setImageUrl(editingItem.imageUrl || '');
      setNotes(editingItem.notes || '');
      setAlarmDaysBeforeExpiry(editingItem.alarmDaysBeforeExpiry || 3);
    } else {
      setName('');
      setCategory('Verduras & Hortalizas');
      setIsCustomCategory(false);
      setCustomCategory('');
      setQuantity(5);
      setUnit('kg');
      setMinStock(2);
      setEntryDate(getTodayIso());
      setExpiryDate(getDefaultExpiryIso());
      setLocation(STORAGE_LOCATIONS[0]);
      setIsCustomLocation(false);
      setCustomLocation('');
      setSupplier('');
      setBatchNumber('');
      setCostPerUnit(0);
      setImageUrl('');
      setNotes('');
      setAlarmDaysBeforeExpiry(3);
    }
    setError(null);
  }, [editingItem, isOpen]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Por favor selecciona un archivo de imagen válido (JPG, PNG, WebP).');
      return;
    }

    try {
      setIsCompressing(true);
      setError(null);
      const compressed = await compressImageFile(file, 800, 800, 0.85);
      setImageUrl(compressed);
    } catch (err: any) {
      console.error(err);
      setError('No se pudo procesar la imagen seleccionada.');
    } finally {
      setIsCompressing(false);
      if (e.target) e.target.value = '';
    }
  };

  if (!isOpen) return null;

  const daysRemaining = calculateDaysRemaining(expiryDate);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Por favor ingresa el nombre del alimento o insumo.');
      return;
    }
    if (quantity < 0) {
      setError('La cantidad en inventario no puede ser negativa.');
      return;
    }
    if (!entryDate) {
      setError('Por favor selecciona la fecha de ingreso.');
      return;
    }
    if (!expiryDate) {
      setError('Por favor selecciona la fecha de caducidad / vencimiento.');
      return;
    }

    const finalCategory = (isCustomCategory ? customCategory.trim() : category) as PerishableCategory;
    const finalLocation = isCustomLocation ? customLocation.trim() : location;

    if (!finalCategory) {
      setError('Por favor especifica una categoría para el insumo.');
      return;
    }

    if (!finalLocation) {
      setError('Por favor especifica una ubicación de almacenamiento.');
      return;
    }

    onSave({
      name: name.trim(),
      category: finalCategory,
      quantity: Number(quantity),
      unit,
      minStock: Number(minStock) || 0,
      entryDate,
      expiryDate,
      location: finalLocation,
      supplier: supplier.trim() || undefined,
      batchNumber: batchNumber.trim() || undefined,
      costPerUnit: Number(costPerUnit) || 0,
      imageUrl: imageUrl.trim() || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80',
      notes: notes.trim() || undefined,
      alarmDaysBeforeExpiry: Number(alarmDaysBeforeExpiry) || 3
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-pink-50/50 dark:bg-slate-850">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pink-100 dark:bg-pink-950/80 text-[#681841] dark:text-pink-300 flex items-center justify-center font-black">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-slate-900 dark:text-white">
                {editingItem ? 'Editar Insumo Perecedero' : 'Registrar Verdura, Fruta o Insumo de Bar'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Control de lote, fecha de ingreso, caducidad y alarma de stock
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          
          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Name & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Nombre del Alimento / Insumo *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Limón Tahití, Tomate Chonto, Hierbabuena..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#e64980] outline-hidden"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Categoría de Insumo *
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const next = !isCustomCategory;
                    setIsCustomCategory(next);
                    if (next && !customCategory) {
                      setCustomCategory('');
                    }
                  }}
                  className="text-[11px] font-bold text-pink-600 dark:text-pink-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  {isCustomCategory ? '← Elegir de la lista' : '+ Personalizada'}
                </button>
              </div>

              {isCustomCategory ? (
                <div className="space-y-1">
                  <input
                    type="text"
                    autoFocus
                    required
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Escribe la categoría (Ej. Panadería, Especias, Pastelería...)"
                    className="w-full px-3 py-2 rounded-xl border border-pink-400 dark:border-pink-500 bg-pink-50/40 dark:bg-pink-950/20 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#e64980] outline-hidden"
                  />
                  <p className="text-[10px] text-slate-400">
                    💡 Categoría personalizada para este insumo.
                  </p>
                </div>
              ) : (
                <select
                  value={category}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setIsCustomCategory(true);
                    } else {
                      setCategory(e.target.value as PerishableCategory);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#e64980] outline-hidden cursor-pointer"
                >
                  {PERISHABLE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="__custom__" className="text-pink-600 font-bold">
                    ✨ + Añadir categoría personalizada...
                  </option>
                </select>
              )}
            </div>
          </div>

          {/* Quantity, Unit & Min Stock */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Cantidad Actual *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Unidad de Medida *
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as MeasurementUnit)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
              >
                {MEASUREMENT_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Alerta Stock Mínimo
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          {/* DATES: Entry date & Expiration date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  <span>Fecha de Ingreso *</span>
                </label>
                <button
                  type="button"
                  onClick={() => setEntryDate(getTodayIso())}
                  className="text-[10px] text-pink-600 dark:text-pink-400 font-bold hover:underline cursor-pointer"
                >
                  Poner Hoy
                </button>
              </div>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-amber-300/70 dark:border-amber-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
              />
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                Día que llegó al restaurante o bar.
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Fecha de Caducidad / Vence *</span>
                </label>
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                  daysRemaining < 0
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                    : daysRemaining <= 2
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                }`}>
                  {daysRemaining < 0
                    ? `¡Caducado (${Math.abs(daysRemaining)}d)!`
                    : daysRemaining === 0
                    ? '¡Vence Hoy!'
                    : `${daysRemaining} días restantes`}
                </span>
              </div>
              <input
                type="date"
                required
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-rose-300/70 dark:border-rose-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
              />
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                Fecha límite de consumo sugerida.
              </span>
            </div>
          </div>

          {/* Alarm Configuration & Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Anticipación de Alarma (Días antes de vencer)
              </label>
              <select
                value={alarmDaysBeforeExpiry}
                onChange={(e) => setAlarmDaysBeforeExpiry(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
              >
                <option value={1}>1 día antes (Urgente)</option>
                <option value={2}>2 días antes</option>
                <option value={3}>3 días antes (Recomendado)</option>
                <option value={5}>5 días antes</option>
                <option value={7}>7 días antes (Una semana)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-pink-600" />
                  <span>Ubicación / Nevera / Bodega</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const next = !isCustomLocation;
                    setIsCustomLocation(next);
                    if (next && !customLocation) {
                      setCustomLocation('');
                    }
                  }}
                  className="text-[11px] font-bold text-pink-600 dark:text-pink-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  {isCustomLocation ? '← Elegir de la lista' : '+ Personalizada'}
                </button>
              </div>

              {isCustomLocation ? (
                <div className="space-y-1">
                  <input
                    type="text"
                    autoFocus
                    required
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    placeholder="Escribe la ubicación (Ej. Nevera de Postres, Barra Terraza...)"
                    className="w-full px-3 py-2 rounded-xl border border-pink-400 dark:border-pink-500 bg-pink-50/40 dark:bg-pink-950/20 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#e64980] outline-hidden"
                  />
                  <p className="text-[10px] text-slate-400">
                    💡 Ubicación personalizada de almacenamiento.
                  </p>
                </div>
              ) : (
                <select
                  value={location}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setIsCustomLocation(true);
                    } else {
                      setLocation(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium cursor-pointer"
                >
                  {STORAGE_LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                  <option value="__custom__" className="text-pink-600 font-bold">
                    ✨ + Añadir ubicación personalizada...
                  </option>
                </select>
              )}
            </div>
          </div>

          {/* Supplier, Batch & Cost */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1 flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-slate-400" />
                <span>Proveedor</span>
              </label>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Ej. Abastos, Fruver del Sol..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1 flex items-center gap-1">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                <span>Lote de Compra</span>
              </label>
              <input
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="LOT-2026-X"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                <span>Costo Unitario (COP)</span>
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={costPerUnit}
                onChange={(e) => setCostPerUnit(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          {/* Image & Photo Upload Helper */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-pink-600" />
                <span>Fotografía / Imagen del Insumo</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                id="perishable-photo-input"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{imageUrl ? 'Cambiar foto' : 'Subir foto'}</span>
              </button>
            </div>

            {imageUrl && (
              <div className="flex items-center gap-3 p-2 rounded-xl bg-pink-50/50 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-900/40">
                <img
                  src={imageUrl}
                  alt="Vista previa"
                  className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                    Foto asignada al insumo
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Se mostrará en la lista de almacén y mermas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="text-xs text-rose-500 hover:underline px-2 py-1 font-semibold"
                >
                  Quitar
                </button>
              </div>
            )}
            
            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-1">
              {Object.entries(PRESET_IMAGES).map(([label, url]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setImageUrl(url)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition cursor-pointer shrink-0 ${
                    imageUrl === url
                      ? 'bg-pink-100 dark:bg-pink-950/70 text-[#681841] dark:text-pink-300 border-pink-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="O pega un enlace web (https://...)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white mt-1 text-xs"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Observaciones de Conservación / Uso
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Mantener con hielo, lavar antes de cortar, usar prioritariamente para cócteles de la carta de noche..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          {/* Form Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-xl bg-[#681841] hover:bg-[#571436] text-white font-extrabold shadow-md shadow-[#681841]/25 transition cursor-pointer"
            >
              {editingItem ? 'Guardar Cambios' : 'Registrar Insumo Fresco'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
