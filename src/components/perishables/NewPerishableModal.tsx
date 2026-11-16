import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Calendar,
  AlertTriangle,
  Package,
  MapPin,
  Truck,
  Phone,
  PackageCheck,
  Hash,
  DollarSign,
  Image as ImageIcon,
  Camera,
  MessageCircle,
  Plus,
  Trash2,
  ArrowRightLeft,
  Layers,
  ChevronDown,
  SlidersHorizontal
} from 'lucide-react';
import {
  PerishableItem,
  PerishableCategory,
  MeasurementUnit,
  Supplier,
  InsumoPresentation,
  UnitEquivalence,
  PackagingType
} from '../../types';
import {
  PERISHABLE_CATEGORIES,
  BASE_MEASUREMENT_UNITS,
  PACKAGING_TYPES,
  STORAGE_LOCATIONS,
  calculateDaysRemaining,
  isAmbiguousLegacyUnit,
  formatPackagingLabel,
  formatPresentationSummary,
  formatSpanishNumber,
  buildDefaultPresentationName
} from '../../utils/perishableUtils';
import { convertPerishableBaseUnit } from '../../utils/inventoryCosting';
import { compressImageFile } from '../../utils/imageCompressor';
import {
  formatQuantity,
  normalizeNonNegativeQuantity,
  parseQuantityInput
} from '../../utils/quantityPrecision';
import { getSuspectPresentationWarning, resolveUnitConversion } from '../../utils/recipeUnits';

interface NewPerishableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Omit<PerishableItem, 'id'>) => void;
  editingItem?: PerishableItem | null;
  suppliers?: Supplier[];
  preselectedSupplierId?: string | null;
  onSaveNewSupplier?: (supplier: Omit<Supplier, 'id' | 'createdAt'>) => Supplier;
  onAppendSupplyToSupplier?: (supplierId: string, newItemName: string) => void;
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
  editingItem,
  suppliers = [],
  preselectedSupplierId = null,
  onSaveNewSupplier,
  onAppendSupplyToSupplier
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PerishableCategory>('Verduras & Hortalizas');
  const [quantity, setQuantity] = useState<string>('1');
  const [unit, setUnit] = useState<MeasurementUnit>('kg');
  const [minStock, setMinStock] = useState<string>('2');
  const [entryDate, setEntryDate] = useState<string>(getTodayIso());
  const [expiryDate, setExpiryDate] = useState<string>(getDefaultExpiryIso());
  const [location, setLocation] = useState<string>(STORAGE_LOCATIONS[0]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('__manual__');
  const [supplier, setSupplier] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [manualSupplierHasWhatsapp, setManualSupplierHasWhatsapp] = useState<boolean>(true);
  const [manualSupplierProducts, setManualSupplierProducts] = useState('');
  const [saveToSupplierDirectory, setSaveToSupplierDirectory] = useState<boolean>(true);
  const [batchNumber, setBatchNumber] = useState('');
  const [costPerUnit, setCostPerUnit] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [alarmDaysBeforeExpiry, setAlarmDaysBeforeExpiry] = useState<number>(3);
  const [error, setError] = useState<string | null>(null);

  // Secciones desplegables
  const [openPresentations, setOpenPresentations] = useState(false);
  const [openEquivalences, setOpenEquivalences] = useState(false);
  const [openSupplier, setOpenSupplier] = useState(false);
  const [openAdvanced, setOpenAdvanced] = useState(false);
  const [showPresExtraDetails, setShowPresExtraDetails] = useState(false);

  // Presentaciones comerciales, equivalencias y visualización secundaria
  const [presentations, setPresentations] = useState<InsumoPresentation[]>([]);
  const [equivalences, setEquivalences] = useState<UnitEquivalence[]>([]);
  const [secondaryDisplayUnit, setSecondaryDisplayUnit] = useState<string>('');

  // Form inline guiado para nueva presentación
  const [newPresName, setNewPresName] = useState('');
  const [newPresType, setNewPresType] = useState<PackagingType>('paquete');
  const [newPresQty, setNewPresQty] = useState<string>('6');
  const [newPresUnit, setNewPresUnit] = useState<string>('unidades');
  const [newPresBrand, setNewPresBrand] = useState('');
  const [newPresRefPrice, setNewPresRefPrice] = useState<string>('');

  // Form inline para nueva equivalencia / divisor de bloque
  const [newEqUnit, setNewEqUnit] = useState('tajada');
  const [newEqQty, setNewEqQty] = useState<string>('25');
  const [newEqBaseUnit, setNewEqBaseUnit] = useState<string>('g');
  const [showBlockSplitter, setShowBlockSplitter] = useState(false);
  const [splitTotalQty, setSplitTotalQty] = useState<string>('2.5');
  const [splitTotalUnit, setSplitTotalUnit] = useState<string>('kg');
  const [splitPortionCount, setSplitPortionCount] = useState<string>('100');
  const [splitPortionName, setSplitPortionName] = useState<string>('tajada');

  // Migración asistida de unidad ambigua legacy (ej. paquetes -> unidades)
  const [migrateNewUnit, setMigrateNewUnit] = useState<string>('unidades');
  const [migrateFactor, setMigrateFactor] = useState<string>('6');

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

      setQuantity(formatQuantity(editingItem.quantity ?? editingItem.cantidadActual ?? 0));
      const resolvedBase = editingItem.baseUnit || editingItem.unit;
      setUnit(resolvedBase);
      setMinStock(formatQuantity(editingItem.minStock ?? editingItem.alertaStockMinimo ?? 0));
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

      const matchedSup =
        suppliers.find(s => s.id === editingItem.supplierId) ||
        (editingItem.supplier
          ? suppliers.find(s => s.name.trim().toLowerCase() === editingItem.supplier!.trim().toLowerCase())
          : undefined);

      if (matchedSup) {
        setSelectedSupplierId(matchedSup.id);
        setSupplier(matchedSup.name);
        setSupplierPhone(matchedSup.phone);
        setManualSupplierProducts(matchedSup.suppliesProvided);
        setSaveToSupplierDirectory(false);
      } else {
        setSelectedSupplierId('__manual__');
        setSupplier(editingItem.supplier || '');
        setSupplierPhone(editingItem.supplierPhone || '');
        setManualSupplierProducts('');
        setSaveToSupplierDirectory(Boolean(editingItem.supplier && !matchedSup));
      }

      setBatchNumber(editingItem.batchNumber || '');
      setCostPerUnit(editingItem.costPerUnit || 0);
      setImageUrl(editingItem.imageUrl || '');
      setNotes(editingItem.notes || '');
      setAlarmDaysBeforeExpiry(editingItem.alarmDaysBeforeExpiry || 3);
      setPresentations(editingItem.presentations || []);
      setEquivalences(editingItem.equivalences || []);
      setSecondaryDisplayUnit(editingItem.secondaryDisplayUnit || '');
      setNewPresUnit(isAmbiguousLegacyUnit(resolvedBase) ? 'unidades' : resolvedBase || 'unidades');
      setNewEqBaseUnit(isAmbiguousLegacyUnit(resolvedBase) ? 'g' : resolvedBase || 'g');
    } else {
      setName('');
      setCategory('Verduras & Hortalizas');
      setIsCustomCategory(false);
      setCustomCategory('');
      setQuantity('5');
      setUnit('kg');
      setMinStock('2');
      setEntryDate(getTodayIso());
      setExpiryDate(getDefaultExpiryIso());
      setLocation(STORAGE_LOCATIONS[0]);
      setIsCustomLocation(false);
      setCustomLocation('');

      const preselected = preselectedSupplierId
        ? suppliers.find(s => s.id === preselectedSupplierId)
        : undefined;

      if (preselected) {
        setSelectedSupplierId(preselected.id);
        setSupplier(preselected.name);
        setSupplierPhone(preselected.phone);
        setManualSupplierHasWhatsapp(preselected.hasWhatsapp ?? true);
        setManualSupplierProducts(preselected.suppliesProvided);
        setSaveToSupplierDirectory(false);
      } else {
        setSelectedSupplierId('__manual__');
        setSupplier('');
        setSupplierPhone('');
        setManualSupplierHasWhatsapp(true);
        setManualSupplierProducts('');
        setSaveToSupplierDirectory(true);
      }

      setBatchNumber('');
      setCostPerUnit(0);
      setImageUrl('');
      setNotes('');
      setAlarmDaysBeforeExpiry(3);
      setPresentations([]);
      setEquivalences([]);
      setSecondaryDisplayUnit('');
      setNewPresUnit('kg');
      setNewEqBaseUnit('g');
    }

    setNewPresName('');
    setNewPresBrand('');
    setNewPresRefPrice('');
    setShowPresExtraDetails(false);
    setShowBlockSplitter(false);
    setOpenPresentations(false);
    setOpenEquivalences(false);
    setOpenSupplier(Boolean(preselectedSupplierId));
    setOpenAdvanced(false);
    setError(null);
  }, [editingItem, isOpen, preselectedSupplierId, suppliers]);

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
  const showLegacyMigrationBox = isAmbiguousLegacyUnit(unit) && Boolean(editingItem);

  const draftPresQty = parseQuantityInput(newPresQty, 0);
  const suspectPresWarning = getSuspectPresentationWarning(draftPresQty, newPresUnit);
  const draftPresCompat = resolveUnitConversion({
    fromUnit: newPresUnit,
    toUnit: unit,
    equivalences
  });

  const handleApplyLegacyMigration = () => {
    const factor = parseQuantityInput(migrateFactor, 0);
    if (!factor || factor <= 0 || !migrateNewUnit) {
      setError('Ingresa un factor de conversión válido mayor a 0.');
      return;
    }
    const simulatedItem: PerishableItem = {
      ...(editingItem || {
        id: 'temp',
        name: name || 'Insumo',
        category,
        quantity: parseQuantityInput(quantity, 0),
        unit,
        minStock: parseQuantityInput(minStock, 0),
        entryDate,
        expiryDate,
        location,
        alarmDaysBeforeExpiry
      }),
      quantity: parseQuantityInput(quantity, 0),
      minStock: parseQuantityInput(minStock, 0),
      unit,
      costPerUnit: Number(costPerUnit) || 0
    };
    const converted = convertPerishableBaseUnit({
      item: simulatedItem,
      newBaseUnit: migrateNewUnit,
      unitsPerOldUnit: factor
    });
    setUnit(converted.unit);
    setQuantity(formatQuantity(converted.quantity));
    setMinStock(formatQuantity(converted.minStock));
    setCostPerUnit(converted.costPerUnit || 0);
    setError(null);
  };

  const handleAddPresentation = () => {
    const qty = parseQuantityInput(newPresQty, 0);
    if (qty <= 0) {
      setError('La cantidad contenida de la presentación debe ser mayor a 0.');
      return;
    }
    const labelName =
      newPresName.trim() || buildDefaultPresentationName(newPresType, qty, newPresUnit);

    const nextPres: InsumoPresentation = {
      id: `pres-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: labelName,
      packagingType: newPresType,
      contentQty: qty,
      contentUnit: newPresUnit,
      ...(newPresBrand.trim() ? { brand: newPresBrand.trim() } : {}),
      ...(parseFloat(newPresRefPrice) > 0 ? { referencePrice: parseFloat(newPresRefPrice) } : {}),
      isDefault: presentations.length === 0,
      active: true
    };
    setPresentations(prev => [...prev, nextPres]);
    setNewPresName('');
    setNewPresBrand('');
    setNewPresRefPrice('');
    setShowPresExtraDetails(false);
    setError(null);
  };

  const handleAddEquivalence = () => {
    const cleanEqUnit = newEqUnit.trim().toLowerCase();
    const qty = parseQuantityInput(newEqQty, 0);
    if (!cleanEqUnit || qty <= 0) {
      setError('Especifica el nombre de la unidad equivalente y una cantidad mayor a 0.');
      return;
    }
    const eq: UnitEquivalence = {
      id: `eq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      unit: cleanEqUnit,
      quantityInBaseUnit: qty,
      baseUnitLabel: newEqBaseUnit
    };
    setEquivalences(prev => {
      const filtered = prev.filter(e => e.unit.toLowerCase() !== cleanEqUnit);
      return [...filtered, eq];
    });
    if (!secondaryDisplayUnit) {
      setSecondaryDisplayUnit(cleanEqUnit);
    }
    setError(null);
  };

  const handleApplyBlockSplit = () => {
    const totalQty = parseQuantityInput(splitTotalQty, 0);
    const portionCount = parseQuantityInput(splitPortionCount, 0);
    const cleanName = splitPortionName.trim().toLowerCase();
    if (totalQty <= 0 || portionCount <= 0 || !cleanName) {
      setError('Completa el peso/cantidad total del bloque y la cantidad de porciones.');
      return;
    }
    let perPortionQty = totalQty / portionCount;
    let outUnit = splitTotalUnit;
    if (splitTotalUnit === 'kg' && perPortionQty < 1) {
      perPortionQty = perPortionQty * 1000;
      outUnit = 'g';
    } else if (splitTotalUnit === 'litros' && perPortionQty < 1) {
      perPortionQty = perPortionQty * 1000;
      outUnit = 'ml';
    }
    const cleanPerPortion = Math.round(perPortionQty * 10000) / 10000;
    const eq: UnitEquivalence = {
      id: `eq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      unit: cleanName,
      quantityInBaseUnit: cleanPerPortion,
      baseUnitLabel: outUnit
    };
    setEquivalences(prev => [...prev.filter(e => e.unit.toLowerCase() !== cleanName), eq]);
    setSecondaryDisplayUnit(cleanName);
    setShowBlockSplitter(false);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Por favor ingresa el nombre del alimento o insumo.');
      return;
    }
    const parsedQuantity = parseQuantityInput(quantity, -1);
    if (parsedQuantity < 0) {
      setError('La cantidad en inventario no puede ser negativa.');
      return;
    }
    if (!expiryDate) {
      setError('Por favor selecciona la fecha de vencimiento.');
      return;
    }

    const finalEntryDate = entryDate || getTodayIso();
    const finalCategory = (isCustomCategory ? customCategory.trim() : category) as PerishableCategory;
    const finalLocation = (isCustomLocation ? customLocation.trim() : location) || STORAGE_LOCATIONS[0];

    if (!finalCategory) {
      setError('Por favor especifica una categoría para el insumo.');
      return;
    }

    let finalSupplierId: string | undefined = undefined;
    let finalSupplierName: string | undefined = supplier.trim() || undefined;
    let finalSupplierPhone: string | undefined = supplierPhone.trim() || undefined;

    if (selectedSupplierId !== '__manual__') {
      const existingSup = suppliers.find(s => s.id === selectedSupplierId);
      if (existingSup) {
        finalSupplierId = existingSup.id;
        finalSupplierName = existingSup.name;
        finalSupplierPhone = existingSup.phone;
        if (onAppendSupplyToSupplier && name.trim()) {
          onAppendSupplyToSupplier(existingSup.id, name.trim());
        }
      }
    } else if (finalSupplierName && saveToSupplierDirectory && onSaveNewSupplier) {
      const duplicate = suppliers.find(
        s => s.name.trim().toLowerCase() === finalSupplierName!.toLowerCase()
      );
      if (duplicate) {
        finalSupplierId = duplicate.id;
        if (!finalSupplierPhone) finalSupplierPhone = duplicate.phone;
        if (onAppendSupplyToSupplier && name.trim()) {
          onAppendSupplyToSupplier(duplicate.id, name.trim());
        }
      } else {
        const suppliesText = manualSupplierProducts.trim()
          ? manualSupplierProducts.trim()
          : name.trim();
        const created = onSaveNewSupplier({
          name: finalSupplierName,
          phone: finalSupplierPhone || 'Sin teléfono',
          hasWhatsapp: Boolean(finalSupplierPhone) && manualSupplierHasWhatsapp,
          suppliesProvided: suppliesText
        });
        finalSupplierId = created.id;
      }
    }

    const cleanQuantity = normalizeNonNegativeQuantity(parseQuantityInput(quantity, 0));
    const cleanMinStock = normalizeNonNegativeQuantity(parseQuantityInput(minStock, 0));
    const numericCost = Number(costPerUnit) || 0;

    onSave({
      ...(editingItem?.lots ? { lots: editingItem.lots } : {}),
      ...(editingItem?.pendingReconciliations
        ? { pendingReconciliations: editingItem.pendingReconciliations }
        : {}),
      ...(editingItem?.pendingValuationCount !== undefined
        ? { pendingValuationCount: editingItem.pendingValuationCount }
        : {}),
      ...(editingItem?.lastCostUpdatedAt ? { lastCostUpdatedAt: editingItem.lastCostUpdatedAt } : {}),
      name: name.trim(),
      category: finalCategory,
      quantity: cleanQuantity,
      unit,
      baseUnit: unit,
      minStock: cleanMinStock,
      cantidadActual: cleanQuantity,
      alertaStockMinimo: cleanMinStock,
      entryDate: finalEntryDate,
      expiryDate,
      location: finalLocation,
      supplierId: finalSupplierId,
      supplier: finalSupplierName,
      supplierPhone: finalSupplierPhone,
      batchNumber: batchNumber.trim() || undefined,
      costPerUnit: numericCost,
      costStatus:
        editingItem?.costStatus ||
        (numericCost > 0 ? 'exact' : 'pending_valuation'),
      presentations,
      equivalences,
      ...(secondaryDisplayUnit ? { secondaryDisplayUnit } : {}),
      imageUrl: imageUrl.trim() || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80',
      notes: notes.trim() || undefined,
      alarmDaysBeforeExpiry: Number(alarmDaysBeforeExpiry) || 3
    });

    onClose();
  };

  const unitOptions = isAmbiguousLegacyUnit(unit)
    ? [...BASE_MEASUREMENT_UNITS, { value: unit, label: `${unit} (Actual)` }]
    : BASE_MEASUREMENT_UNITS;

  const hasPresentationMismatch = presentations.some(
    p =>
      p.active !== false &&
      !resolveUnitConversion({ fromUnit: p.contentUnit, toUnit: unit, equivalences }).compatible
  );

  const selectedPackagingLabel = formatPackagingLabel(newPresType, false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-stone-50/60 dark:bg-slate-850 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 text-rose-950 dark:text-rose-300 border border-stone-200 dark:border-stone-700 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-base text-slate-900 dark:text-white truncate">
                {editingItem ? 'Editar ingrediente' : 'Nuevo ingrediente'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Completa los datos básicos; lo demás es opcional
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. CAMPOS PRINCIPALES: Nombre & Categoría */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Nombre *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Queso cheddar, Pan brioche, Tomate..."
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900 outline-hidden"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Categoría *
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
                  className="text-[11px] font-bold text-rose-900 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  {isCustomCategory ? '← Elegir de lista' : '+ Otra'}
                </button>
              </div>

              {isCustomCategory ? (
                <input
                  type="text"
                  autoFocus
                  required
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Ej. Panadería, Especias..."
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-stone-400 dark:border-stone-500 bg-stone-50/40 dark:bg-stone-900/20 text-slate-900 dark:text-white font-medium outline-hidden"
                />
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
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium outline-hidden cursor-pointer"
                >
                  {PERISHABLE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="__custom__" className="text-rose-900 font-bold">
                    + Añadir otra categoría...
                  </option>
                </select>
              )}
            </div>
          </div>

          {/* 2. Cantidad disponible, Unidad, Stock mínimo y Fecha de vencimiento */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Cantidad disponible *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums font-bold"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Unidad *
              </label>
              <select
                value={unit}
                onChange={(e) => {
                  const next = e.target.value as MeasurementUnit;
                  setUnit(next);
                  if (!editingItem && presentations.length === 0) {
                    setNewPresUnit(next);
                  }
                }}
                className="w-full min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold cursor-pointer"
              >
                {unitOptions.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Stock mínimo
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 truncate">
                  Vencimiento *
                </label>
                <span
                  className={`text-[10px] font-bold shrink-0 ${
                    daysRemaining < 0
                      ? 'text-rose-600'
                      : daysRemaining <= 2
                      ? 'text-amber-600'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {daysRemaining < 0
                    ? `-${Math.abs(daysRemaining)}d`
                    : daysRemaining === 0
                    ? 'Hoy'
                    : `${daysRemaining}d`}
                </span>
              </div>
              <input
                type="date"
                required
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums font-semibold"
              />
            </div>
          </div>

          {/* Asistente inline si el ítem editado usa unidad legacy ambigua */}
          {showLegacyMigrationBox && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-900 dark:text-amber-200 block">
                    Unidad de empaque (&quot;{unit}&quot;)
                  </span>
                  <span className="text-[11px] text-amber-800 dark:text-amber-300 block mt-0.5">
                    Cambia este inventario a unidades, kg o gramos para evitar errores al comprar y descontar recetas.
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  1 {unit} contiene:
                </span>
                <input
                  type="number"
                  min="0.0001"
                  step="any"
                  value={migrateFactor}
                  onChange={e => setMigrateFactor(e.target.value)}
                  className="w-20 min-h-[40px] px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white"
                />
                <select
                  value={migrateNewUnit}
                  onChange={e => setMigrateNewUnit(e.target.value)}
                  className="min-h-[40px] px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 font-semibold text-slate-900 dark:text-white"
                >
                  {BASE_MEASUREMENT_UNITS.map(u => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleApplyLegacyMigration}
                  className="min-h-[40px] px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] cursor-pointer transition"
                >
                  Convertir ahora
                </button>
              </div>
            </div>
          )}

          {/* SECCIONES DESPLEGABLES */}
          <div className="space-y-2.5">
            {/* A. Presentaciones de compra */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/60 dark:bg-slate-850">
              <button
                type="button"
                onClick={() => setOpenPresentations(v => !v)}
                className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Layers className="w-4 h-4 text-rose-900 dark:text-rose-400 shrink-0" />
                  <span className="font-bold text-slate-900 dark:text-white">
                    Presentaciones de compra
                  </span>
                  {hasPresentationMismatch && (
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
                      · Revisar unidad
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                    {presentations.length > 0
                      ? `${presentations.length} ${presentations.length === 1 ? 'presentación' : 'presentaciones'}`
                      : 'Opcional'}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform ${
                      openPresentations ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>

              {openPresentations && (
                <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900/50">
                  {presentations.length > 0 && (
                    <div className="space-y-1.5">
                      {presentations.map(pres => (
                        <div
                          key={pres.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {formatPresentationSummary(pres)}
                            </span>
                            {pres.isDefault && (
                              <span className="ml-2 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                                · Principal
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {!pres.isDefault && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPresentations(prev =>
                                    prev.map(p => ({ ...p, isDefault: p.id === pres.id }))
                                  )
                                }
                                className="min-h-[36px] text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:underline px-2 cursor-pointer"
                              >
                                Principal
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setPresentations(prev => prev.filter(p => p.id !== pres.id))
                              }
                              className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-rose-600 cursor-pointer"
                              aria-label="Quitar presentación"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Preguntas guiadas simples */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        ¿Cómo compras este ingrediente?
                      </label>
                      <select
                        value={newPresType}
                        onChange={e => setNewPresType(e.target.value as PackagingType)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold"
                      >
                        {PACKAGING_TYPES.map(t => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        ¿Cuánto trae cada {selectedPackagingLabel}?
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="any"
                          min="0.0001"
                          value={newPresQty}
                          onChange={e => setNewPresQty(e.target.value)}
                          placeholder="Ej. 2.5"
                          className="w-24 min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-bold text-center text-slate-900 dark:text-white"
                        />
                        <select
                          value={newPresUnit}
                          onChange={e => setNewPresUnit(e.target.value)}
                          className="flex-1 min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold"
                        >
                          {BASE_MEASUREMENT_UNITS.map(u => (
                            <option key={u.value} value={u.value}>
                              {u.value}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Vista previa clara + validaciones preventivas */}
                  {draftPresQty > 0 && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-300">
                      Vista previa:{' '}
                      <strong className="text-slate-900 dark:text-white">
                        {buildDefaultPresentationName(newPresType, draftPresQty, newPresUnit)}
                      </strong>
                    </div>
                  )}

                  {suspectPresWarning && (
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
                      <span>{suspectPresWarning.message}</span>
                      {suspectPresWarning.suggestedUnit && (
                        <button
                          type="button"
                          onClick={() => setNewPresUnit(suspectPresWarning.suggestedUnit!)}
                          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer shrink-0"
                        >
                          Cambiar a {formatSpanishNumber(draftPresQty)} {suspectPresWarning.suggestedUnit}
                        </button>
                      )}
                    </div>
                  )}

                  {draftPresQty > 0 && !draftPresCompat.compatible && (
                    <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-900 dark:text-amber-200">
                      Tu inventario está en <strong>{unit}</strong>, pero vas a comprar en{' '}
                      <strong>{newPresUnit}</strong>. Si lo controlas por peso/volumen, cambia la unidad arriba a{' '}
                      <strong>{newPresUnit}</strong>.
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPresExtraDetails(v => !v)}
                      className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPresExtraDetails
                        ? 'Ocultar nombre comercial / marca'
                        : '+ Nombre comercial o marca (opcional)'}
                    </button>

                    <button
                      type="button"
                      onClick={handleAddPresentation}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar presentación</span>
                    </button>
                  </div>

                  {showPresExtraDetails && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                      <input
                        type="text"
                        value={newPresName}
                        onChange={e => setNewPresName(e.target.value)}
                        placeholder="Nombre comercial (opc.)"
                        className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        value={newPresBrand}
                        onChange={e => setNewPresBrand(e.target.value)}
                        placeholder="Marca (opc.)"
                        className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={newPresRefPrice}
                        onChange={e => setNewPresRefPrice(e.target.value)}
                        placeholder="Precio ref. COP (opc.)"
                        className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* B. Equivalencias de recetas */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/60 dark:bg-slate-850">
              <button
                type="button"
                onClick={() => setOpenEquivalences(v => !v)}
                className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ArrowRightLeft className="w-4 h-4 text-rose-900 dark:text-rose-400 shrink-0" />
                  <span className="font-bold text-slate-900 dark:text-white">
                    Equivalencias de recetas
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {equivalences.length > 0
                      ? `${equivalences.length} ${equivalences.length === 1 ? 'regla' : 'reglas'}`
                      : 'Ej. tajadas o porciones'}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform ${
                      openEquivalences ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>

              {openEquivalences && (
                <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Si usas porciones en tus recetas (ej. 1 tajada = 25 g)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowBlockSplitter(s => !s)}
                      className="text-[11px] font-bold text-rose-900 dark:text-rose-400 hover:underline cursor-pointer shrink-0"
                    >
                      {showBlockSplitter ? 'Cerrar calculadora' : 'Calcular desde un bloque'}
                    </button>
                  </div>

                  {showBlockSplitter && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                      <span className="font-bold text-slate-700 dark:text-slate-200 block">
                        Ej: 1 bloque de 2,5 kg trae 100 tajadas → 25 g cada una
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>1 empaque de</span>
                        <input
                          type="number"
                          step="any"
                          value={splitTotalQty}
                          onChange={e => setSplitTotalQty(e.target.value)}
                          className="w-20 min-h-[40px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-white"
                        />
                        <select
                          value={splitTotalUnit}
                          onChange={e => setSplitTotalUnit(e.target.value)}
                          className="min-h-[40px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        >
                          {BASE_MEASUREMENT_UNITS.map(u => (
                            <option key={u.value} value={u.value}>{u.value}</option>
                          ))}
                        </select>
                        <span>trae</span>
                        <input
                          type="number"
                          step="any"
                          value={splitPortionCount}
                          onChange={e => setSplitPortionCount(e.target.value)}
                          className="w-20 min-h-[40px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-white"
                        />
                        <input
                          type="text"
                          value={splitPortionName}
                          onChange={e => setSplitPortionName(e.target.value)}
                          placeholder="tajada / porción"
                          className="w-28 min-h-[40px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={handleApplyBlockSplit}
                          className="min-h-[40px] px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                        >
                          Calcular
                        </button>
                      </div>
                    </div>
                  )}

                  {equivalences.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {equivalences.map(eq => (
                        <div
                          key={eq.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        >
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            1 {eq.unit} = {formatSpanishNumber(eq.quantityInBaseUnit)} {eq.baseUnitLabel || unit}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEquivalences(prev => prev.filter(x => x.id !== eq.id))
                            }
                            className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-4 flex items-center gap-1.5">
                      <span className="font-bold text-slate-600 dark:text-slate-300 shrink-0">1</span>
                      <input
                        type="text"
                        value={newEqUnit}
                        onChange={e => setNewEqUnit(e.target.value)}
                        placeholder="tajada / porción"
                        className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-3 flex items-center gap-1.5">
                      <span className="font-bold text-slate-600 dark:text-slate-300 shrink-0">=</span>
                      <input
                        type="number"
                        step="any"
                        min="0.0001"
                        value={newEqQty}
                        onChange={e => setNewEqQty(e.target.value)}
                        className="w-full min-h-[40px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center text-slate-900 dark:text-white"
                      />
                    </div>
                    <select
                      value={newEqBaseUnit}
                      onChange={e => setNewEqBaseUnit(e.target.value)}
                      className="sm:col-span-3 min-h-[40px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold"
                    >
                      {BASE_MEASUREMENT_UNITS.map(u => (
                        <option key={u.value} value={u.value}>{u.value}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddEquivalence}
                      className="sm:col-span-2 min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar</span>
                    </button>
                  </div>

                  {(equivalences.length > 0 || presentations.length > 0) && (
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
                      <label className="font-semibold text-slate-600 dark:text-slate-300">
                        Mostrar también en Despensa como:
                      </label>
                      <select
                        value={secondaryDisplayUnit}
                        onChange={e => setSecondaryDisplayUnit(e.target.value)}
                        className="min-h-[38px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold"
                      >
                        <option value="">Automático</option>
                        {equivalences.map(eq => (
                          <option key={eq.id} value={eq.unit}>
                            {eq.unit}
                          </option>
                        ))}
                        {presentations.map(p => (
                          <option key={p.id} value={p.packagingType}>
                            {formatPresentationSummary(p)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* C. Proveedor */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/60 dark:bg-slate-850">
              <button
                type="button"
                onClick={() => setOpenSupplier(v => !v)}
                className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Truck className="w-4 h-4 text-rose-900 dark:text-rose-400 shrink-0" />
                  <span className="font-bold text-slate-900 dark:text-white">
                    Proveedor
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                    {supplier.trim() ? supplier.trim() : 'Opcional'}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform ${
                      openSupplier ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>

              {openSupplier && (
                <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900/50">
                  {suppliers.length > 0 && (
                    <select
                      value={selectedSupplierId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedSupplierId(val);
                        if (val === '__manual__') {
                          setSupplier('');
                          setSupplierPhone('');
                          setManualSupplierProducts('');
                          setSaveToSupplierDirectory(true);
                        } else {
                          const found = suppliers.find(s => s.id === val);
                          if (found) {
                            setSupplier(found.name);
                            setSupplierPhone(found.phone);
                            setManualSupplierProducts(found.suppliesProvided);
                            setSaveToSupplierDirectory(false);
                          }
                        }
                      }}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold cursor-pointer"
                    >
                      <option value="__manual__">+ Ingresar proveedor manualmente</option>
                      {suppliers.map((sup) => (
                        <option key={sup.id} value={sup.id}>
                          {sup.name} ({sup.phone})
                        </option>
                      ))}
                    </select>
                  )}

                  {selectedSupplierId !== '__manual__' ? (
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {supplier} {supplierPhone ? `· ${supplierPhone}` : ''}
                        </div>
                        {manualSupplierProducts && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {manualSupplierProducts}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSupplierId('__manual__');
                          setSupplier('');
                          setSupplierPhone('');
                          setManualSupplierProducts('');
                          setSaveToSupplierDirectory(true);
                        }}
                        className="text-[11px] font-bold text-rose-900 dark:text-rose-400 hover:underline shrink-0 cursor-pointer"
                      >
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                            <Truck className="w-3 h-3 text-slate-400" />
                            <span>Nombre del proveedor</span>
                          </label>
                          <input
                            type="text"
                            value={supplier}
                            onChange={(e) => setSupplier(e.target.value)}
                            placeholder="Ej. Abastos, Fruver del Sol..."
                            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>Teléfono / WhatsApp</span>
                          </label>
                          <input
                            type="tel"
                            value={supplierPhone}
                            onChange={(e) => setSupplierPhone(e.target.value)}
                            placeholder="Ej. 300 123 4567"
                            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                          />
                        </div>
                      </div>

                      {supplier.trim() && (
                        <div className="space-y-2">
                          <div>
                            <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                              <PackageCheck className="w-3 h-3 text-emerald-600" />
                              <span>¿Qué vende este proveedor?</span>
                            </label>
                            <input
                              type="text"
                              value={manualSupplierProducts}
                              onChange={(e) => setManualSupplierProducts(e.target.value)}
                              placeholder={name.trim() ? `Ej. ${name.trim()}...` : 'Ej. Lácteos, carnes...'}
                              className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
                          </div>

                          {onSaveNewSupplier && (
                            <div className="flex flex-wrap items-center gap-4">
                              <label className="inline-flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={saveToSupplierDirectory}
                                  onChange={(e) => setSaveToSupplierDirectory(e.target.checked)}
                                  className="rounded border-slate-300 text-rose-950 focus:ring-rose-900"
                                />
                                <span>Guardar en directorio</span>
                              </label>

                              {saveToSupplierDirectory && supplierPhone.trim() && (
                                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                  <input
                                    type="checkbox"
                                    checked={manualSupplierHasWhatsapp}
                                    onChange={(e) => setManualSupplierHasWhatsapp(e.target.checked)}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                                  />
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  <span>Tiene WhatsApp</span>
                                </label>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* D. Configuración avanzada */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/60 dark:bg-slate-850">
              <button
                type="button"
                onClick={() => setOpenAdvanced(v => !v)}
                className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <SlidersHorizontal className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="font-bold text-slate-900 dark:text-white">
                    Configuración avanzada
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                    Costo, lote, ubicación, foto
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform ${
                      openAdvanced ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>

              {openAdvanced && (
                <div className="px-3.5 pb-3.5 pt-2.5 border-t border-slate-200/80 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900/50">
                  {/* Costo & Lote */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                          <span>Costo por {unit} (COP)</span>
                        </label>
                        {editingItem?.costStatus && (
                          <span className="text-[10px] font-bold text-slate-500">
                            {editingItem.costStatus === 'exact'
                              ? 'Promedio exacto'
                              : editingItem.costStatus === 'provisional'
                              ? 'Provisional'
                              : 'Sin valorar'}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={costPerUnit}
                        onChange={(e) => setCostPerUnit(parseFloat(e.target.value) || 0)}
                        placeholder="0 (opcional)"
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                        <Hash className="w-3.5 h-3.5 text-slate-400" />
                        <span>Lote de compra</span>
                      </label>
                      <input
                        type="text"
                        value={batchNumber}
                        onChange={(e) => setBatchNumber(e.target.value)}
                        placeholder="LOT-2026-X"
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Fecha ingreso, Alarma y Ubicación */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Fecha de ingreso</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setEntryDate(getTodayIso())}
                          className="text-[10px] text-rose-900 dark:text-rose-400 font-bold hover:underline cursor-pointer"
                        >
                          Hoy
                        </button>
                      </div>
                      <input
                        type="date"
                        value={entryDate}
                        onChange={(e) => setEntryDate(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Alarma antes de vencer
                      </label>
                      <select
                        value={alarmDaysBeforeExpiry}
                        onChange={(e) => setAlarmDaysBeforeExpiry(parseInt(e.target.value, 10))}
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      >
                        <option value={1}>1 día antes</option>
                        <option value={2}>2 días antes</option>
                        <option value={3}>3 días antes (Recomendado)</option>
                        <option value={5}>5 días antes</option>
                        <option value={7}>7 días antes</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-stone-500" />
                        <span>Ubicación / Nevera / Bodega</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !isCustomLocation;
                          setIsCustomLocation(next);
                          if (next && !customLocation) setCustomLocation('');
                        }}
                        className="text-[11px] font-bold text-rose-900 dark:text-rose-400 hover:underline cursor-pointer"
                      >
                        {isCustomLocation ? '← Elegir de lista' : '+ Otra'}
                      </button>
                    </div>

                    {isCustomLocation ? (
                      <input
                        type="text"
                        value={customLocation}
                        onChange={(e) => setCustomLocation(e.target.value)}
                        placeholder="Ej. Nevera de Postres..."
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-400 dark:border-stone-500 bg-stone-50/40 dark:bg-stone-900/20 text-slate-900 dark:text-white font-medium outline-hidden"
                      />
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
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium cursor-pointer"
                      >
                        {STORAGE_LOCATIONS.map((loc) => (
                          <option key={loc} value={loc}>
                            {loc}
                          </option>
                        ))}
                        <option value="__custom__" className="text-rose-900 font-bold">
                          + Añadir otra ubicación...
                        </option>
                      </select>
                    )}
                  </div>

                  {/* Foto */}
                  <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-stone-500" />
                        <span>Fotografía (opcional)</span>
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
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>{imageUrl ? 'Cambiar foto' : 'Subir foto'}</span>
                      </button>
                    </div>

                    {imageUrl && (
                      <div className="flex items-center gap-3 p-2 rounded-xl bg-stone-50 dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800">
                        <img
                          src={imageUrl}
                          alt="Vista previa"
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex-1 truncate">
                          Imagen asignada
                        </span>
                        <button
                          type="button"
                          onClick={() => setImageUrl('')}
                          className="text-xs text-rose-500 hover:underline px-2 py-1 font-semibold cursor-pointer"
                        >
                          Quitar
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {Object.entries(PRESET_IMAGES).map(([label, url]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setImageUrl(url)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition cursor-pointer shrink-0 ${
                            imageUrl === url
                              ? 'bg-rose-950 text-white border-rose-900'
                              : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700'
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
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                    />
                  </div>

                  {/* Notas */}
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Notas de uso o conservación
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ej. Mantener refrigerado, lavar antes de cortar..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-6 py-2 rounded-xl bg-rose-950 hover:bg-rose-900 text-white font-extrabold shadow-xs transition cursor-pointer"
            >
              {editingItem ? 'Guardar cambios' : 'Guardar ingrediente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
