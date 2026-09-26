import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Product } from '../../types';
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
  RefreshCw
} from 'lucide-react';
import { compressImageFile } from '../../utils/imageCompressor';

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
  const { config, updateConfig, addProduct, updateProduct, canAddProduct } = useApp();

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
  const [description, setDescription] = useState(productToEdit?.description || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    } else {
      setName('');
      setCategory(config.categories.filter(c => c !== 'Todas las categorías')[0] || 'Tapas & Entrantes');
      setIsCustomCategory(false);
      setCustomCategoryName('');
      setPrice('5.50');
      setCost('1.50');
      setStock('30');
      setMinStock('10');
      setSku(`ART-${Math.floor(100 + Math.random() * 900)}`);
      setImageUrl(PRESET_GASTRO_PHOTOS[0].url);
      setDescription('');
    }
  }, [productToEdit, isOpen, config.categories]);

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

    const numericPrice = parseFloat(price) || 0;
    const numericCost = parseFloat(cost) || 0;
    const numericStock = parseInt(stock, 10) || 0;
    const numericMinStock = parseInt(minStock, 10) || 5;

    if (numericPrice <= 0) {
      setErrorMsg('El precio de venta debe ser mayor a 0.');
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
        description: description.trim()
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
        description: description.trim()
      });

      if (!res.success) {
        setErrorMsg(res.error || 'No se pudo guardar el producto.');
      } else {
        onClose();
      }
    }
  };

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

          {/* Pricing & Costs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                PVP Venta ({config.currency})
              </label>
              <input
                type="number"
                step="0.01"
                required
                disabled={reachedLimit}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs sm:text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Coste ({config.currency})
              </label>
              <input
                type="number"
                step="0.01"
                disabled={reachedLimit}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Stock Actual
              </label>
              <input
                type="number"
                disabled={reachedLimit}
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs sm:text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Aviso Stock Mínimo
              </label>
              <input
                type="number"
                disabled={reachedLimit}
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
              />
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
