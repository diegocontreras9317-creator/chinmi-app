import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Product } from '../../types';
import { formatCOP } from '../../utils/currency';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  Package,
  Layers,
  TrendingUp,
  LayoutGrid,
  List,
  Sparkles,
  Check,
  X
} from 'lucide-react';
import { NewProductModal } from './NewProductModal';
import { CategoryScrollBar } from '../common/CategoryScrollBar';

interface InventoryModuleProps {
  onOpenSubscription: () => void;
}

export const InventoryModule: React.FC<InventoryModuleProps> = ({ onOpenSubscription }) => {
  const { config, products, addProduct, deleteProduct, adjustProductStock, canAddProduct } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas las categorías');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  // Card size state: 'sm' (Pequeño), 'md' (Mediano), 'lg' (Grande)
  const [cardSize, setCardSize] = useState<'sm' | 'md' | 'lg'>(() => {
    try {
      return (localStorage.getItem('chinmi_menu_card_size') as 'sm' | 'md' | 'lg') || 'md';
    } catch {
      return 'md';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('chinmi_menu_card_size', cardSize);
    } catch {
      // ignore
    }
  }, [cardSize]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [deletedToast, setDeletedToast] = useState<{
    product: Product;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  // Filters
  const filteredProducts = products.filter(prod => {
    const matchesCat = selectedCategory === 'Todas las categorías' || prod.category === selectedCategory;
    const matchesSearch = prod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          prod.sku.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesStock = true;
    if (stockFilter === 'low') matchesStock = prod.stock <= prod.minStock && prod.stock > 0;
    if (stockFilter === 'out') matchesStock = prod.stock <= 0;

    return matchesCat && matchesSearch && matchesStock;
  });

  // KPI Calculations
  const totalProducts = products.length;
  const lowStockCount = products.filter(p => p.stock <= p.minStock && p.stock > 0).length;
  const outOfStockCount = products.filter(p => p.stock <= 0).length;
  const inventoryTotalValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
  const inventoryTotalCost = products.reduce((sum, p) => sum + (p.cost * p.stock), 0);
  const averageMargin = products.length > 0
    ? Math.round(products.reduce((acc, p) => acc + ((p.price - p.cost) / (p.price || 1)) * 100, 0) / products.length)
    : 0;

  const handleEdit = (product: Product) => {
    setProductToEdit(product);
    setIsModalOpen(true);
  };

  const handleDelete = (item: Product | string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const id = typeof item === 'string' ? item : item.id;
    const found = products.find(p => p.id === id);
    
    // Direct and immediate deletion of the product
    deleteProduct(id);

    if (found) {
      if (deletedToast?.timer) {
        clearTimeout(deletedToast.timer);
      }
      const t = setTimeout(() => {
        setDeletedToast(null);
      }, 5000);
      setDeletedToast({
        product: found,
        timer: t
      });
    }
  };

  const handleUndo = () => {
    if (deletedToast) {
      clearTimeout(deletedToast.timer);
      addProduct(deletedToast.product);
      setDeletedToast(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      
      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Catálogo Activo</span>
            <Package className="w-4 h-4 text-orange-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {totalProducts} <span className="text-xs font-normal text-slate-400">referencias</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Límite Free: {config.freemiumLimits.freeMaxProducts}</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Valor Inventario (PVP)</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2 font-mono">
            {formatCOP(inventoryTotalValue)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Coste: {formatCOP(inventoryTotalCost)}</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Alertas Stock Mínimo</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
            {lowStockCount + outOfStockCount}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {outOfStockCount > 0 ? `${outOfStockCount} agotados` : 'Ninguno agotado'}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Margen Medio</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-2 font-mono">
            {averageMargin}%
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Rentabilidad estimada de carta</p>
        </div>
      </div>

      {/* Control Bar: Search, Category, Stock Filters & View Toggle */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          
          {/* Search Bar */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar producto por nombre o SKU..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
            
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('grid')}
                title="Vista cuadrícula"
                className={`p-1.5 rounded-lg transition ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-900 text-orange-600 shadow-xs'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                title="Vista tabla"
                className={`p-1.5 rounded-lg transition ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-orange-600 shadow-xs'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Selector de Tamaño para Menú: Grande, Mediano, Pequeño */}
            {viewMode === 'grid' && (
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700/80 text-xs">
                <button
                  type="button"
                  onClick={() => setCardSize('sm')}
                  title="Ver carta en tamaño pequeño (compacta)"
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    cardSize === 'sm'
                      ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Pequeño
                </button>
                <button
                  type="button"
                  onClick={() => setCardSize('md')}
                  title="Ver carta en tamaño mediano (estándar)"
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    cardSize === 'md'
                      ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Mediano
                </button>
                <button
                  type="button"
                  onClick={() => setCardSize('lg')}
                  title="Ver carta en tamaño grande (amplia)"
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    cardSize === 'lg'
                      ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Grande
                </button>
              </div>
            )}

            {/* Add Product Button */}
            <button
              id="btn-add-product"
              onClick={() => {
                setProductToEdit(null);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Añadir Producto</span>
            </button>
          </div>

        </div>

        {/* Category & Stock Filter Chips */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
          
          <div className="flex-1 min-w-0">
            <CategoryScrollBar
              categories={config.categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              accentColor="dark"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs self-start lg:self-auto shrink-0">
            <button
              onClick={() => setStockFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                stockFilter === 'all' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'
              }`}
            >
              Todos ({products.length})
            </button>
            <button
              onClick={() => setStockFilter('low')}
              className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
                stockFilter === 'low' ? 'bg-white dark:bg-slate-900 text-amber-600 shadow-xs' : 'text-slate-500'
              }`}
            >
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              Bajo Stock ({lowStockCount})
            </button>
            <button
              onClick={() => setStockFilter('out')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                stockFilter === 'out' ? 'bg-white dark:bg-slate-900 text-rose-600 shadow-xs' : 'text-slate-500'
              }`}
            >
              Agotados ({outOfStockCount})
            </button>
          </div>

        </div>

      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div
          className={
            cardSize === 'sm'
              ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3'
              : cardSize === 'lg'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'
              : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
          }
        >
          {filteredProducts.map((product) => {
            const isLowStock = product.stock <= product.minStock && product.stock > 0;
            const isOutOfStock = product.stock <= 0;
            const margin = Math.round(((product.price - product.cost) / (product.price || 1)) * 100);

            {/* === MENÚ TAMAÑO PEQUEÑO (COMPACTO) === */}
            if (cardSize === 'sm') {
              return (
                <div
                  key={product.id}
                  id={`inventory-card-${product.id}`}
                  className="group p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-md transition flex flex-col justify-between"
                >
                  <div>
                    {/* Foto Compacta */}
                    <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-2 bg-slate-100 dark:bg-slate-800">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <span className="absolute top-1.5 left-1.5 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-900/80 text-white backdrop-blur-xs">
                        {product.sku}
                      </span>
                      {isLowStock && (
                        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500 text-white">
                          Bajo ({product.stock})
                        </span>
                      )}
                      {isOutOfStock && (
                        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-600 text-white">
                          Agotado
                        </span>
                      )}
                    </div>

                    {/* Info Compacta */}
                    <div>
                      <span className="text-[9px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider truncate block">
                        {product.category}
                      </span>
                      <h3 className="font-bold text-xs text-slate-900 dark:text-white truncate mt-0.5" title={product.name}>
                        {product.name}
                      </h3>
                    </div>

                    {/* Precio y Stock */}
                    <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="font-mono font-black text-xs text-slate-900 dark:text-white">
                        {formatCOP(product.price, false)}
                      </span>
                      <span className={`text-[10px] font-bold font-mono px-1 py-0.2 rounded ${
                        isOutOfStock ? 'text-rose-600 bg-rose-50 dark:bg-rose-950/40' : isLowStock ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' : 'text-emerald-600'
                      }`}>
                        {product.stock} ud.
                      </span>
                    </div>
                  </div>

                  {/* Footer Compacto */}
                  <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => adjustProductStock(product.id, -1)}
                        className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200"
                        title="-1 unidad"
                      >
                        -1
                      </button>
                      <button
                        onClick={() => adjustProductStock(product.id, 1)}
                        className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200"
                        title="+1 unidad"
                      >
                        +1
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(product)}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(product.id, e)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                        title="Eliminar producto"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            {/* === MENÚ TAMAÑO GRANDE (AMPLIO Y VISUAL) === */}
            if (cardSize === 'lg') {
              return (
                <div
                  key={product.id}
                  id={`inventory-card-${product.id}`}
                  className="group p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition flex flex-col justify-between"
                >
                  <div>
                    {/* Foto Grande */}
                    <div className="relative aspect-16/10 w-full rounded-2xl overflow-hidden mb-4 bg-slate-100 dark:bg-slate-800 shadow-inner">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <span className="absolute top-3 left-3 text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-900/80 text-white backdrop-blur-xs">
                        SKU: {product.sku}
                      </span>
                      {isLowStock && (
                        <span className="absolute top-3 right-3 text-xs font-extrabold px-2.5 py-1 rounded-lg bg-amber-500 text-white shadow-xs">
                          ⚠️ Aviso Stock ({product.stock} disponibles)
                        </span>
                      )}
                      {isOutOfStock && (
                        <span className="absolute top-3 right-3 text-xs font-extrabold px-2.5 py-1 rounded-lg bg-rose-600 text-white shadow-xs">
                          🚫 Agotado
                        </span>
                      )}
                    </div>

                    {/* Info Grande */}
                    <div>
                      <span className="text-xs font-extrabold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                        {product.category}
                      </span>
                      <h3 className="font-black text-xl text-slate-900 dark:text-white mt-1 leading-tight">
                        {product.name}
                      </h3>
                      {product.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed line-clamp-2">
                          {product.description}
                        </p>
                      )}
                    </div>

                    {/* Financials Grande */}
                    <div className="mt-4 p-3 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">PVP Venta Carta</span>
                        <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                          {formatCOP(product.price)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Margen</span>
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg inline-block mt-0.5">
                          +{margin}% ganancia
                        </span>
                      </div>
                    </div>

                    {/* Stepper Grande */}
                    <div className="mt-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-600 dark:text-slate-300">Existencias en Barra/Cocina:</span>
                        <span className={`font-mono text-sm font-black ${isOutOfStock ? 'text-rose-600' : isLowStock ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {product.stock} unidades
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 justify-end pt-1">
                        <span className="text-xs text-slate-400 mr-auto font-medium">Ajuste rápido:</span>
                        <button
                          onClick={() => adjustProductStock(product.id, -1)}
                          className="px-3 py-1 text-xs rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 transition cursor-pointer"
                        >
                          -1
                        </button>
                        <button
                          onClick={() => adjustProductStock(product.id, 1)}
                          className="px-3 py-1 text-xs rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 transition cursor-pointer"
                        >
                          +1
                        </button>
                        <button
                          onClick={() => adjustProductStock(product.id, 10)}
                          className="px-3 py-1 text-xs rounded-xl bg-orange-50 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 font-extrabold hover:bg-orange-100 transition cursor-pointer"
                        >
                          +10 Reposición
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Footer Grande */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">
                      Stock mínimo de alerta: <strong>{product.minStock} uds</strong>
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(product)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                        title="Editar producto"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>
                      <button
                        onClick={(e) => handleDelete(product.id, e)}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                        title="Eliminar producto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            {/* === MENÚ TAMAÑO MEDIANO (ESTÁNDAR) === */}
            return (
              <div
                key={product.id}
                id={`inventory-card-${product.id}`}
                className="group p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  {/* Photo with badges */}
                  <div className="relative aspect-4/3 w-full rounded-xl overflow-hidden mb-3 bg-slate-100 dark:bg-slate-800">
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <span className="absolute top-2 left-2 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-900/80 text-white backdrop-blur-xs">
                      {product.sku}
                    </span>

                    {isLowStock && (
                      <span className="absolute top-2 right-2 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-500 text-white shadow-xs">
                        Aviso Stock ({product.stock})
                      </span>
                    )}
                    {isOutOfStock && (
                      <span className="absolute top-2 right-2 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-600 text-white shadow-xs">
                        Agotado
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div>
                    <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                      {product.category}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1 mt-0.5">
                      {product.name}
                    </h3>
                    {product.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                        {product.description}
                      </p>
                    )}
                  </div>

                  {/* Financials */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block leading-tight">PVP Venta</span>
                      <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                        {formatCOP(product.price, false)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block leading-tight">Coste / Margen</span>
                      <span className="font-mono text-slate-600 dark:text-slate-400">
                        {formatCOP(product.cost, false)} <span className="text-emerald-600 font-bold">({margin}%)</span>
                      </span>
                    </div>
                  </div>

                  {/* Stock Progress & Stepper */}
                  <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-600 dark:text-slate-400">Stock en almacén:</span>
                      <span className={`font-mono font-bold ${isOutOfStock ? 'text-rose-600' : isLowStock ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {product.stock} uds
                      </span>
                    </div>

                    <div className="flex items-center gap-1 justify-end pt-1">
                      <span className="text-[10px] text-slate-400 mr-auto">Ajuste rápido:</span>
                      <button
                        onClick={() => adjustProductStock(product.id, -1)}
                        className="px-2 py-0.5 text-xs rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                        title="-1 unidad"
                      >
                        -1
                      </button>
                      <button
                        onClick={() => adjustProductStock(product.id, 1)}
                        className="px-2 py-0.5 text-xs rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                        title="+1 unidad"
                      >
                        +1
                      </button>
                      <button
                        onClick={() => adjustProductStock(product.id, 10)}
                        className="px-2 py-0.5 text-xs rounded-md bg-orange-50 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 font-semibold hover:bg-orange-100"
                        title="+10 reposición"
                      >
                        +10
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="mt-4 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    Mínimo: {product.minStock} uds
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(product)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      title="Editar producto"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(product.id, e)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                      title="Eliminar producto"
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

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">PVP</th>
                  <th className="px-4 py-3 text-right">Coste</th>
                  <th className="px-4 py-3 text-center">Stock</th>
                  <th className="px-4 py-3 text-center">Ajuste Rápido</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProducts.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    <td className="px-4 py-3 flex items-center gap-3">
                      <img src={prod.imageUrl} alt={prod.name} className="w-9 h-9 rounded-lg object-cover" />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{prod.name}</p>
                        <p className="text-[10px] text-slate-400 line-clamp-1">{prod.description}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{prod.category}</td>
                    <td className="px-4 py-3 font-mono text-slate-400">{prod.sku}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCOP(prod.price, false)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">
                      {formatCOP(prod.cost, false)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block font-mono font-bold px-2 py-0.5 rounded-full ${
                        prod.stock <= 0
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          : prod.stock <= prod.minStock
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}>
                        {prod.stock} uds
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => adjustProductStock(prod.id, -1)}
                          className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                        >
                          -1
                        </button>
                        <button
                          onClick={() => adjustProductStock(prod.id, 1)}
                          className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                        >
                          +1
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(prod)}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                          title="Editar producto"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(prod.id, e)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 transition cursor-pointer"
                          title="Eliminar producto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Freemium Limit Alert */}
      {!canAddProduct() && (
        <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-slate-900 dark:text-white">
                Has alcanzado el límite de {config.freemiumLimits.freeMaxProducts} productos del plan gratuito
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Pasa al plan PRO para desbloquear catálogo ilimitado, control de lotes y analítica de escandallos.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenSubscription}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition whitespace-nowrap cursor-pointer"
          >
            Actualizar a PRO
          </button>
        </div>
      )}

      {/* New / Edit Product Modal */}
      <NewProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        productToEdit={productToEdit}
        onOpenSubscription={onOpenSubscription}
      />

      {/* Floating Toast Notification with Undo */}
      {deletedToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 dark:border-slate-300 animate-in fade-in slide-in-from-bottom-3">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="text-xs font-semibold">
              Producto <span className="font-bold">"{deletedToast.product.name}"</span> eliminado.
            </span>
          </div>
          <button
            onClick={handleUndo}
            className="px-2.5 py-1 text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition cursor-pointer"
          >
            Deshacer
          </button>
          <button
            onClick={() => {
              clearTimeout(deletedToast.timer);
              setDeletedToast(null);
            }}
            className="text-slate-400 hover:text-white dark:hover:text-slate-900 p-0.5 cursor-pointer"
            title="Cerrar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

    </div>
  );
};
