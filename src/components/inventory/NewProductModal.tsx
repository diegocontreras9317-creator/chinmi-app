import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Product, ProductTaxType, RecipeIngredient, PerishableItem } from '../../types';
import {
  DEFAULT_IMPOCONSUMO_RATE,
  DEFAULT_IVA_RATE,
  resolveProductTax
} from '../../utils/taxes';
import {
  X,
  Plus,
  AlertCircle,
  Sparkles,
  Image as ImageIcon,
  Upload,
  Camera,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Percent,
  ChefHat,
  Package,
  Search
} from 'lucide-react';
import { compressImageFile } from '../../utils/imageCompressor';
import {
  RECIPE_UNIT_OPTIONS,
  normalizeToRecipeUnit,
  getUnitConversionFactor
} from '../../utils/recipeUnits';

interface NewProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
  onOpenSubscription: () => void;
}

// Curated high-definition food and drink photo presets for immediate 1-click selection
const PRESET_GASTRO_PHOTOS = [
  { name: 'Caña / Cerveza', url: 'https://images.unsplash.com/photo-1608270199581-998cb3d21175?auto=format&fit=crop&w=400&q=80' },
  { name: 'Vino Tinto / Blanco', url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=400&q=80' },
  { name: 'Patatas Bravas', url: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=400&q=80' },
  { name: 'Jamón Ibérico', url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80' },
  { name: 'Croquetas', url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=400&q=80' },
  { name: 'Hamburguesa', url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80' },
  { name: 'Pulpo / Pescado', url: 'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=400&q=80' },
  { name: 'Refrescos / Agua', url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80' },
  { name: 'Cóctel Mojito', url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80' },
  { name: 'Café Espresso', url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=400&q=80' },
  { name: 'Tarta / Postre', url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=400&q=80' },
  { name: 'Ensalada Fresca', url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80' }
];

export const NewProductModal: React.FC<NewProductModalProps> = ({
  isOpen,
  onClose,
  productToEdit,
  onOpenSubscription
}) => {
  const { config, updateConfig, addProduct, updateProduct, canAddProduct, perishables } = useApp();

  const isEditing = !!productToEdit;
  const reachedLimit = !isEditing && !canAddProduct();

  const isExistingCategory = config.categories.includes(productToEdit?.category || '');
  const [name, setName] = useState(productToEdit?.name || '');
  const [category, setCategory] = useState(productToEdit?.category || config.categories[1] || 'Tapas & Entrantes');
  const [isCustomCategory, setIsCustomCategory] = useState(
    productToEdit?.category ? !isExistingCategory : false
  );
  const [customCategoryName, setCustomCategoryName] = useState(
    productToEdit?.category && !isExistingCategory ? productToEdit.category : ''
  );
  const [price, setPrice] = useState(productToEdit ? String(productToEdit.price) : '5.50');
  const [cost, setCost] = useState(productToEdit ? String(productToEdit.cost) : '1.50');
  const [stock, setStock] = useState(productToEdit ? String(productToEdit.stock) : '30');
  const [minStock, setMinStock] = useState(productToEdit ? String(productToEdit.minStock) : '10');
  const [sku, setSku] = useState(productToEdit?.sku || `ART-${Math.floor(100 + Math.random() * 900)}`);
  const [imageUrl, setImageUrl] = useState(productToEdit?.imageUrl || PRESET_GASTRO_PHOTOS[0].url);
  const [imageTab, setImageTab] = useState<'upload' | 'preset' | 'url'>('upload');
  const [isCompressing, setIsCompressing] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initialResolvedTax = resolveProductTax(productToEdit, config.defaultTaxRate);
  const [taxType, setTaxType] = useState<ProductTaxType>(initialResolvedTax.taxType);
  const [taxRate, setTaxRate] = useState<string>(String(initialResolvedTax.taxRate));
  const [description, setDescription] = useState(productToEdit?.description || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Control de Inventario: Directo vs Con Receta / Preparado
  const [tipoInventario, setTipoInventario] = useState<'directo' | 'receta'>(
    productToEdit?.tipoInventario ||
      (productToEdit?.receta && productToEdit.receta.length > 0 ? 'receta' : 'directo')
  );
  const [receta, setReceta] = useState<RecipeIngredient[]>(productToEdit?.receta || []);
  const [selectedInsumoId, setSelectedInsumoId] = useState<string>('');
  const [ingredientQty, setIngredientQty] = useState<string>('');
  const [ingredientUnit, setIngredientUnit] = useState<string>('und');

  // Cálculo de escandallo: coste total y porciones disponibles según el insumo limitante en Despensa con conversión de unidades
  const recipeBreakdown = React.useMemo<{
    items: Array<
      RecipeIngredient & {
        pantryItem?: PerishableItem;
        unitCost: number;
        subtotal: number;
        available: number;
        portions: number;
        conversionFactor: number;
        requiredInPantryUnit: number;
      }
    >;
    totalCost: number;
    estimatedPortions: number;
    limitingInsumo: { name: string; available: number; unit: string; maxPortions: number } | null;
  }>(() => {
    let totalCost = 0;
    let minPortions = Infinity;
    let limitingInsumo: { name: string; available: number; unit: string; maxPortions: number } | null = null;

    const items = receta.map((ing) => {
      const pantryItem = perishables.find((p) => p.id === ing.insumoId);
      const conversionFactor = getUnitConversionFactor(ing.unidad, pantryItem?.unit);
      const unitCost = pantryItem?.costPerUnit ?? ing.costoUnitario ?? 0;
      const requiredInPantryUnit = (Number(ing.cantidad) || 0) * conversionFactor;
      const subtotal = requiredInPantryUnit * unitCost;
      totalCost += subtotal;

      const available = pantryItem ? Number(pantryItem.quantity) || 0 : 0;
      const portions = requiredInPantryUnit > 0 ? Math.floor(available / requiredInPantryUnit) : 0;

      if (portions < minPortions) {
        minPortions = portions;
        limitingInsumo = {
          name: pantryItem?.name || ing.nombre,
          available,
          unit: pantryItem?.unit || ing.unidad,
          maxPortions: portions
        };
      }

      return {
        ...ing,
        pantryItem,
        unitCost,
        subtotal,
        available,
        portions,
        conversionFactor,
        requiredInPantryUnit
      };
    });

    const estimatedPortions = receta.length === 0 ? 0 : (minPortions === Infinity ? 0 : minPortions);

    return {
      items,
      totalCost,
      estimatedPortions,
      limitingInsumo
    };
  }, [receta, perishables]);

  // Recalcular automáticamente el coste del producto sumando (insumo.cantidad * insumo.costoUnitario)
  React.useEffect(() => {
    if (tipoInventario === 'receta' && receta.length > 0) {
      setCost(recipeBreakdown.totalCost > 0 ? String(Math.round(recipeBreakdown.totalCost * 100) / 100) : '0');
    }
  }, [tipoInventario, recipeBreakdown.totalCost, receta.length]);

  React.useEffect(() => {
    if (productToEdit) {
      setName(productToEdit.name || '');
      const existing = config.categories.includes(productToEdit.category);
      if (existing) {
        setCategory(productToEdit.category);
        setIsCustomCategory(false);
        setCustomCategoryName('');
      } else {
        setCategory(productToEdit.category);
        setIsCustomCategory(true);
        setCustomCategoryName(productToEdit.category);
      }
      setPrice(String(productToEdit.price));
      setCost(String(productToEdit.cost));
      setStock(String(productToEdit.stock));
      setMinStock(String(productToEdit.minStock));
      setSku(productToEdit.sku || '');
      setImageUrl(productToEdit.imageUrl || PRESET_GASTRO_PHOTOS[0].url);
      setDescription(productToEdit.description || '');
      const resolved = resolveProductTax(productToEdit, config.defaultTaxRate);
      setTaxType(resolved.taxType);
      setTaxRate(String(resolved.taxRate));
      setTipoInventario(
        productToEdit.tipoInventario ||
          (productToEdit.receta && productToEdit.receta.length > 0 ? 'receta' : 'directo')
      );
      setReceta(productToEdit.receta || []);
    } else {
      setName('');
      setCategory(config.categories.filter(c => c !== 'Todas las categorías')[0] || 'Tapas & Entrantes');
      setIsCustomCategory(false);
      setCustomCategoryName('');
      setPrice('15000');
      setCost('5000');
      setStock('30');
      setMinStock('10');
      setSku(`ART-${Math.floor(100 + Math.random() * 900)}`);
      setImageUrl(PRESET_GASTRO_PHOTOS[0].url);
      setDescription('');
      setTaxType('impoconsumo');
      setTaxRate(String(config.defaultTaxRate || DEFAULT_IMPOCONSUMO_RATE));
      setTipoInventario('directo');
      setReceta([]);
      setIngredientUnit('und');
    }
  }, [productToEdit, isOpen, config.categories, config.defaultTaxRate]);

  const handleAddIngredient = () => {
    setErrorMsg(null);
    if (!selectedInsumoId) {
      setErrorMsg('Selecciona un insumo de la Despensa.');
      return;
    }
    const pantryItem = perishables.find(p => p.id === selectedInsumoId);
    if (!pantryItem) {
      setErrorMsg('Insumo no encontrado en la Despensa.');
      return;
    }
    const numQty = parseFloat(ingredientQty);
    if (!numQty || numQty <= 0) {
      setErrorMsg(`Ingresa una cantidad mayor a 0 para ${pantryItem.name}.`);
      return;
    }

    const chosenUnit = ingredientUnit || normalizeToRecipeUnit(pantryItem.unit);

    const existingIdx = receta.findIndex(r => r.insumoId === pantryItem.id);
    if (existingIdx >= 0) {
      const updated = [...receta];
      updated[existingIdx] = {
        ...updated[existingIdx],
        cantidad: numQty,
        unidad: chosenUnit,
        costoUnitario: pantryItem.costPerUnit || 0
      };
      setReceta(updated);
    } else {
      setReceta(prev => [
        ...prev,
        {
          insumoId: pantryItem.id,
          nombre: pantryItem.name,
          cantidad: numQty,
          unidad: chosenUnit,
          costoUnitario: pantryItem.costPerUnit || 0
        }
      ]);
    }

    setSelectedInsumoId('');
    setIngredientQty('');
    setIngredientUnit('und');
  };

  const handleRemoveIngredient = (insumoId: string) => {
    setReceta(prev => prev.filter(r => r.insumoId !== insumoId));
  };

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor selecciona un archivo de imagen válido (JPG, PNG, WebP).');
      return;
    }

    try {
      setIsCompressing(true);
      setErrorMsg(null);
      const compressed = await compressImageFile(file, 800, 800, 0.85);
      setImageUrl(compressed);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3500);
    } catch (err: any) {
      console.error('Error al subir imagen:', err);
      setErrorMsg(err.message || 'No se pudo procesar la imagen seleccionada.');
    } finally {
      setIsCompressing(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('El nombre del producto es obligatorio.');
      return;
    }

    const finalCategory = isCustomCategory ? customCategoryName.trim() : category;

    if (!finalCategory) {
      setErrorMsg('Por favor especifica una categoría para el producto.');
      return;
    }

    // Guardar la nueva categoría personalizada en config para que aparezca en el menú y filtros
    if (isCustomCategory && !config.categories.includes(finalCategory)) {
      updateConfig({
        categories: [...config.categories, finalCategory]
      });
    }

    const isRecipeProduct = tipoInventario === 'receta';
    const numericPrice = parseFloat(price) || 0;
    const numericCost = isRecipeProduct && recipeBreakdown.totalCost > 0
      ? Math.round(recipeBreakdown.totalCost * 100) / 100
      : (parseFloat(cost) || 0);
    const numericStock = isRecipeProduct ? recipeBreakdown.estimatedPortions : (parseInt(stock, 10) || 0);
    const numericMinStock = parseInt(minStock, 10) || 5;
    const parsedTaxRate = taxType === 'exento' ? 0 : Math.max(0, parseFloat(taxRate));
    const finalTaxRate =
      taxType === 'exento'
        ? 0
        : Number.isNaN(parsedTaxRate)
        ? taxType === 'iva'
          ? DEFAULT_IVA_RATE
          : DEFAULT_IMPOCONSUMO_RATE
        : parsedTaxRate;
    const finalTaxType: ProductTaxType = finalTaxRate === 0 ? 'exento' : taxType;

    if (numericPrice <= 0) {
      setErrorMsg('El precio de venta debe ser mayor a 0.');
      return;
    }

    if (finalTaxRate > 100) {
      setErrorMsg('El porcentaje de impuesto no puede superar el 100%.');
      return;
    }

    if (isEditing && productToEdit) {
      updateProduct(productToEdit.id, {
        name: name.trim(),
        category: finalCategory,
        price: numericPrice,
        cost: numericCost,
        stock: numericStock,
        minStock: numericMinStock,
        sku: sku.trim(),
        imageUrl: imageUrl.trim(),
        description: description.trim(),
        taxType: finalTaxType,
        taxRate: finalTaxRate,
        tipoInventario,
        receta: isRecipeProduct ? receta : []
      });
      onClose();
    } else {
      const res = addProduct({
        name: name.trim(),
        category: finalCategory,
        price: numericPrice,
        cost: numericCost,
        stock: numericStock,
        minStock: numericMinStock,
        sku: sku.trim(),
        imageUrl: imageUrl.trim() || PRESET_GASTRO_PHOTOS[0].url,
        description: description.trim(),
        taxType: finalTaxType,
        taxRate: finalTaxRate,
        tipoInventario,
        receta: isRecipeProduct ? receta : []
      });

      if (!res.success) {
        setErrorMsg(res.error || 'No se pudo guardar el producto.');
      } else {
        onClose();
      }
    }
  };

  const previewPrice = Math.max(0, parseFloat(price) || 0);
  const previewRate =
    taxType === 'exento'
      ? 0
      : Math.max(
          0,
          Number.isNaN(parseFloat(taxRate))
            ? taxType === 'iva'
              ? DEFAULT_IVA_RATE
              : DEFAULT_IMPOCONSUMO_RATE
            : parseFloat(taxRate)
        );
  const previewTaxAmount =
    previewRate > 0 ? previewPrice - previewPrice / (1 + previewRate / 100) : 0;
  const previewBaseAmount = Math.max(0, previewPrice - previewTaxAmount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-950/50 flex items-center justify-center text-orange-600 dark:text-orange-400">
              <Plus className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-base text-slate-900 dark:text-white">
              {isEditing ? 'Editar Producto del Menú / Almacén' : 'Añadir Nuevo Producto al Inventario'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Freemium limit notice */}
        {reachedLimit && (
          <div className="p-4 mx-6 mt-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs shrink-0">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-300">
                  Límite de Catálogo alcanzado ({config.freemiumLimits.freeMaxProducts} productos)
                </p>
                <p className="text-amber-800 dark:text-amber-400 mt-0.5">
                  El plan gratuito permite hasta {config.freemiumLimits.freeMaxProducts} referencias. Mejora al plan PRO para inventario ilimitado y escaneo de stock.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSubscription();
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Desbloquear Plan PRO</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 border border-rose-200 dark:border-rose-900">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Product Name & SKU */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nombre del Producto / Bebida / Ración
              </label>
              <input
                type="text"
                required
                disabled={reachedLimit}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Hamburguesa Angus, Caña Doble, Gin Tonic"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Código / SKU
              </label>
              <input
                type="text"
                disabled={reachedLimit}
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="ART-001"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Categoría
              </label>
              <button
                type="button"
                onClick={() => {
                  const nextState = !isCustomCategory;
                  setIsCustomCategory(nextState);
                  if (nextState && !customCategoryName) {
                    setCustomCategoryName('');
                  }
                }}
                className="text-[11px] font-bold text-orange-600 hover:text-orange-700 dark:text-orange-400 hover:underline cursor-pointer flex items-center gap-1"
              >
                {isCustomCategory ? '← Elegir de la lista' : '+ Nueva categoría personalizada'}
              </button>
            </div>

            {isCustomCategory ? (
              <div className="space-y-1.5">
                <input
                  type="text"
                  autoFocus
                  required
                  disabled={reachedLimit}
                  value={customCategoryName}
                  onChange={(e) => setCustomCategoryName(e.target.value)}
                  placeholder="Escribe el nombre de tu categoría (Ej. Carnes Maduradas, Coctelería de Autor...)"
                  className="w-full px-3 py-2 rounded-xl border border-orange-300 dark:border-orange-500/50 bg-orange-50/40 dark:bg-orange-950/20 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  💡 Esta categoría personalizada se creará y estará disponible en el menú y filtros.
                </p>
              </div>
            ) : (
              <select
                value={category}
                disabled={reachedLimit}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomCategory(true);
                  } else {
                    setCategory(e.target.value);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 cursor-pointer"
              >
                {config.categories.filter(c => c !== 'Todas las categorías').map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="__custom__" className="font-bold text-orange-600 dark:text-orange-400">
                  + Escribir categoría personalizada...
                </option>
              </select>
            )}
          </div>

          {/* Selector de Tipo de Inventario: Directo vs Con Receta / Preparado */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
              Tipo de Control de Inventario
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={reachedLimit}
                onClick={() => setTipoInventario('directo')}
                className={`p-3 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer ${
                  tipoInventario === 'directo'
                    ? 'bg-orange-50/90 dark:bg-orange-950/40 border-orange-500 ring-2 ring-orange-500/30'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80 hover:border-slate-300'
                }`}
              >
                <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                  tipoInventario === 'directo'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}>
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Producto Directo</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      Bebidas, snacks
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Control de stock manual por unidades (cervezas, refrescos, productos empacados).
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={reachedLimit}
                onClick={() => setTipoInventario('receta')}
                className={`p-3 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer ${
                  tipoInventario === 'receta'
                    ? 'bg-orange-50/90 dark:bg-orange-950/40 border-orange-500 ring-2 ring-orange-500/30'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80 hover:border-slate-300'
                }`}
              >
                <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                  tipoInventario === 'receta'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}>
                  <ChefHat className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Producto Con Receta / Preparado</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-orange-100 dark:bg-orange-900/60 text-orange-700 dark:text-orange-300 font-bold">
                      Hamburguesas, cocina
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Descuenta ingredientes de la Despensa y calcula porciones disponibles estimadas.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Sección de Receta / Escandallo (solo si es Producto Con Receta) */}
          {tipoInventario === 'receta' && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-amber-50/90 via-orange-50/50 to-amber-50/40 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-slate-900 border border-amber-200/90 dark:border-amber-800/60 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-orange-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <ChefHat className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Escandallo / Receta Conectada a Despensa
                    </h4>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Selecciona los insumos requeridos por plato para costear y descontar inventario en lote.
                    </p>
                  </div>
                </div>

                {/* Indicador Visual: Porciones Disponibles Estimadas */}
                <div className="flex items-center gap-2">
                  {receta.length > 0 ? (
                    <div
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shadow-xs ${
                        recipeBreakdown.estimatedPortions > 5
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                          : recipeBreakdown.estimatedPortions > 0
                          ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                          : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      <span className="font-mono text-sm font-black">{recipeBreakdown.estimatedPortions}</span>
                      <span>porciones disponibles estimadas</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium italic">
                      Añade insumos abajo para calcular porciones
                    </span>
                  )}
                </div>
              </div>

              {/* Insumo Limitante en Despensa */}
              {receta.length > 0 && recipeBreakdown.limitingInsumo && (
                <div className="text-[11px] flex items-center gap-2 p-2.5 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-amber-200 dark:border-amber-900/50 shadow-2xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-slate-700 dark:text-slate-300">
                    <strong>Insumo limitante:</strong>{' '}
                    <span className="font-bold text-orange-600 dark:text-orange-400">
                      {recipeBreakdown.limitingInsumo.name}
                    </span>{' '}
                    (quedan{' '}
                    <strong className="font-mono text-slate-900 dark:text-white">
                      {recipeBreakdown.limitingInsumo.available} {recipeBreakdown.limitingInsumo.unit}
                    </strong>{' '}
                    en Despensa, alcanza para{' '}
                    <strong className="font-mono text-slate-900 dark:text-white">
                      {recipeBreakdown.limitingInsumo.maxPortions}
                    </strong>{' '}
                    platos).
                  </span>
                </div>
              )}

              {/* Selector / buscador inteligente conectado a la colección de despensa */}
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-orange-500" />
                    <span>Añadir Insumo desde la Despensa</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {perishables.length} insumos registrados
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-5">
                    <select
                      value={selectedInsumoId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedInsumoId(val);
                        const item = perishables.find((p) => p.id === val);
                        if (item) {
                          setIngredientUnit(normalizeToRecipeUnit(item.unit));
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="">-- Selecciona un insumo de Despensa --</option>
                      {perishables.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.quantity} {item.unit} disp. · Costo: ${item.costPerUnit || 0}/{item.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-4">
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0.0001"
                          placeholder="Cantidad"
                          value={ingredientQty}
                          onChange={(e) => setIngredientQty(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono font-bold focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <select
                          value={ingredientUnit}
                          onChange={(e) => setIngredientUnit(e.target.value)}
                          className="w-full px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-orange-500"
                          title="Seleccionar unidad (und, libra, kilo, tajada, gramos, ml, litros)"
                        >
                          {RECIPE_UNIT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <button
                      type="button"
                      onClick={handleAddIngredient}
                      disabled={!selectedInsumoId || !ingredientQty}
                      className="w-full h-full py-2 px-3 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar Insumo</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Lista de Insumos Agregados a la Receta */}
              {receta.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800/80 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                      <tr>
                        <th className="px-3 py-2">Insumo</th>
                        <th className="px-3 py-2">Cant. por plato</th>
                        <th className="px-3 py-2">Stock en Despensa</th>
                        <th className="px-3 py-2">Coste Insumo</th>
                        <th className="px-3 py-2 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {recipeBreakdown.items.map((ing) => (
                        <tr key={ing.insumoId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                          <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">
                            {ing.nombre}
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-orange-600 dark:text-orange-400">
                            {ing.cantidad} {ing.unidad}
                            {ing.conversionFactor !== 1 && ing.pantryItem && (
                              <span className="text-[10px] text-slate-400 block font-normal">
                                (= {Math.round(ing.requiredInPantryUnit * 1000) / 1000} {ing.pantryItem.unit})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">
                            <span className={ing.available <= 0 ? 'text-rose-600 font-bold' : ''}>
                              {ing.available} {ing.pantryItem?.unit || ing.unidad}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              ({ing.portions} porciones)
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-200">
                            $ {new Intl.NumberFormat('es-CO').format(Math.round(ing.subtotal))}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveIngredient(ing.insumoId)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                              title="Quitar de la receta"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-bold text-[11px]">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-slate-600 dark:text-slate-300 text-right">
                          Coste total calculado de la receta:
                        </td>
                        <td className="px-3 py-2 font-mono text-orange-600 dark:text-orange-400 font-black">
                          $ {new Intl.NumberFormat('es-CO').format(Math.round(recipeBreakdown.totalCost))}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="p-3 text-center text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  Ningún insumo vinculado a esta receta todavía. Selecciona uno arriba para comenzar.
                </div>
              )}
            </div>
          )}

          {/* Pricing & Costs */}
          <div className={`grid gap-3 ${tipoInventario === 'receta' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                PVP Venta ({config.currency})
              </label>
              <input
                type="number"
                step="any"
                required
                disabled={reachedLimit}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs sm:text-sm font-mono tabular-nums font-bold focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Coste ({config.currency})
                </label>
                {tipoInventario === 'receta' && receta.length > 0 && (
                  <span className="text-[10px] text-orange-600 dark:text-orange-400 font-bold">
                    (Auto Receta)
                  </span>
                )}
              </div>
              <input
                type="number"
                step="any"
                disabled={reachedLimit || (tipoInventario === 'receta' && receta.length > 0)}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs sm:text-sm font-mono tabular-nums focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 ${
                  tipoInventario === 'receta' && receta.length > 0 ? 'bg-orange-50/50 dark:bg-orange-950/20 font-bold' : ''
                }`}
              />
            </div>

            {/* Si es Producto Directo: se muestra el input manual de Stock Actual */}
            {tipoInventario === 'directo' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Stock Actual
                </label>
                <input
                  type="number"
                  disabled={reachedLimit}
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs sm:text-sm font-mono tabular-nums font-bold focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {tipoInventario === 'receta' ? 'Aviso Porciones Mínimas' : 'Aviso Stock Mínimo'}
              </label>
              <input
                type="number"
                disabled={reachedLimit}
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs sm:text-sm font-mono tabular-nums focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
          </div>

          {/* Impuesto del Producto: Impoconsumo vs IVA */}
          <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <span>Impuesto de consumo del producto (incluido en el PVP)</span>
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Elige si este producto grava con <strong>Impoconsumo</strong> o con <strong>IVA</strong> al facturar.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              {/* Selector principal de régimen de impuesto */}
              <div className="sm:col-span-8">
                <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Tipo de impuesto
                </span>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={reachedLimit}
                    onClick={() => {
                      setTaxType('impoconsumo');
                      if (taxType !== 'impoconsumo' || Number(taxRate) === 0 || Number(taxRate) === 19 || Number(taxRate) === 5) {
                        setTaxRate(String(DEFAULT_IMPOCONSUMO_RATE));
                      }
                    }}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap truncate ${
                      taxType === 'impoconsumo'
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Impoconsumo
                  </button>

                  <button
                    type="button"
                    disabled={reachedLimit}
                    onClick={() => {
                      setTaxType('iva');
                      if (taxType !== 'iva' || Number(taxRate) === 0 || Number(taxRate) === 8) {
                        setTaxRate(String(DEFAULT_IVA_RATE));
                      }
                    }}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap truncate ${
                      taxType === 'iva'
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    IVA
                  </button>

                  <button
                    type="button"
                    disabled={reachedLimit}
                    onClick={() => {
                      setTaxType('exento');
                      setTaxRate('0');
                    }}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap truncate ${
                      taxType === 'exento'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Exento (0%)
                  </button>
                </div>
              </div>

              {/* Porcentaje editable + atajos según selección */}
              <div className="sm:col-span-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Tarifa (%)
                  </label>
                  {taxType === 'iva' && (
                    <div className="flex items-center gap-1">
                      {[19, 5].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          disabled={reachedLimit}
                          onClick={() => setTaxRate(String(preset))}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold transition cursor-pointer ${
                            Number(taxRate) === preset
                              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                              : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300'
                          }`}
                        >
                          {preset}%
                        </button>
                      ))}
                    </div>
                  )}
                  {taxType === 'impoconsumo' && (
                    <button
                      type="button"
                      disabled={reachedLimit}
                      onClick={() => setTaxRate('8')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold transition cursor-pointer ${
                        Number(taxRate) === 8
                          ? 'bg-orange-600 text-white'
                          : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300'
                      }`}
                    >
                      8%
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    disabled={reachedLimit || taxType === 'exento'}
                    value={taxType === 'exento' ? '0' : taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="w-full pr-7 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs sm:text-sm font-mono tabular-nums font-bold focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 disabled:opacity-60"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* Desglose en vivo del PVP */}
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
              <span>
                Base gravable:{' '}
                <strong className="text-slate-900 dark:text-white">
                  $ {new Intl.NumberFormat('es-CO').format(Math.round(previewBaseAmount))}
                </strong>
              </span>
              <span>
                {taxType === 'iva'
                  ? `IVA (${previewRate}% inc.)`
                  : taxType === 'exento' || previewRate === 0
                  ? 'Exento (0%)'
                  : `Impoconsumo (${previewRate}% inc.)`}
                :{' '}
                <strong className="text-orange-600 dark:text-orange-400">
                  $ {new Intl.NumberFormat('es-CO').format(Math.round(previewTaxAmount))}
                </strong>
              </span>
              <span>
                PVP Final:{' '}
                <strong className="text-slate-900 dark:text-white">
                  $ {new Intl.NumberFormat('es-CO').format(Math.round(previewPrice))}
                </strong>
              </span>
            </div>
          </div>

          {/* Subir Foto / Imagen del Producto */}
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Foto del Producto
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Sube una foto real o elige una de la biblioteca para la carta digital.
                </p>
              </div>

              {/* Source tabs */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-[11px] self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setImageTab('upload')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                    imageTab === 'upload'
                      ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Subir Foto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImageTab('preset')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                    imageTab === 'preset'
                      ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Biblioteca</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImageTab('url')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                    imageTab === 'url'
                      ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>Enlace URL</span>
                </button>
              </div>
            </div>

            {/* TAB 1: SUBIR FOTO DESDE DISPOSITIVO O CÁMARA */}
            {imageTab === 'upload' && (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="product-photo-file-input"
                />

                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-orange-50/50 dark:bg-orange-950/20 border-2 border-dashed border-orange-300 dark:border-orange-800/60 transition">
                  {/* Photo Preview Thumbnail */}
                  <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-white dark:border-slate-700 shadow-md shrink-0">
                    <img
                      src={imageUrl}
                      alt="Foto seleccionada"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = PRESET_GASTRO_PHOTOS[0].url;
                      }}
                    />
                    {isCompressing && (
                      <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center text-white text-[10px] font-bold gap-1">
                        <RefreshCw className="w-5 h-5 animate-spin text-orange-400" />
                        <span>Comprimiendo...</span>
                      </div>
                    )}
                  </div>

                  {/* Upload Controls & Instructions */}
                  <div className="flex-1 text-center sm:text-left space-y-2">
                    <div>
                      <p className="font-bold text-xs text-slate-800 dark:text-slate-200">
                        {uploadSuccess ? '✓ ¡Foto cargada correctamente!' : 'Subir foto desde tu dispositivo o cámara'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Selecciona un archivo JPG, PNG o WEBP de tu galería o toma una foto. Se optimiza automáticamente para no ocupar espacio.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isCompressing || reachedLimit}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-xs shadow-sm hover:shadow transition cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>{imageUrl ? 'Elegir otra foto' : 'Subir foto'}</span>
                      </button>

                      {imageUrl && (
                        <button
                          type="button"
                          onClick={() => setImageUrl(PRESET_GASTRO_PHOTOS[0].url)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Restablecer foto</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: BIBLIOTECA PREAJUSTADA */}
            {imageTab === 'preset' && (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Haz clic en cualquier imagen gastronómica prediseñada para asignarla:
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {PRESET_GASTRO_PHOTOS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setImageUrl(preset.url)}
                      className={`relative rounded-xl overflow-hidden aspect-square border-2 transition cursor-pointer group ${
                        imageUrl === preset.url
                          ? 'border-orange-500 ring-2 ring-orange-500/40 shadow-sm'
                          : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                      title={preset.name}
                    >
                      <img src={preset.url} alt={preset.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-200" />
                      <span className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-[9px] truncate px-1 py-0.5 text-center font-semibold">
                        {preset.name}
                      </span>
                      {imageUrl === preset.url && (
                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-orange-600 text-white flex items-center justify-center">
                          <CheckCircle2 className="w-3 h-3" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: ENLACE URL DIRECTO */}
            {imageTab === 'url' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ImageIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://ejemplo.com/foto-plato.jpg"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  Introduce el enlace directo a una imagen alojada en la web.
                </p>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Descripción o Alérgenos (Opcional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ingredientes clave, puntos de carne, alérgenos..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
            />
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={reachedLimit}
              className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:bg-slate-400 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition cursor-pointer"
            >
              {isEditing ? 'Guardar Producto' : 'Añadir al Menú'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
