'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Edit2, Trash2, Search, AlertCircle, GripVertical, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCurrentStore } from '@/lib/current-store';

import { euro } from '@/lib/format';
import { DeclinaisonsProduit } from '@/components/DeclinaisonsProduit';
import { SupplementsProduit } from '@/components/SupplementsProduit';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  isAvailable: boolean;
  sku: string;
  displayOrder: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  category?: {
    id: string;
    name: string;
  };
  /** La première photo du plat (Photos produits), s'il en a une. */
  media?: { url: string }[];
  createdAt: string;
}

interface ProductStats {
  totalReviews: number;
  averageRating: number;
  satisfactionPercentage: number;
}

type CategorySortMode = 'MANUAL' | 'ALPHA_ASC' | 'ALPHA_DESC' | 'PRICE_ASC' | 'PRICE_DESC';

/** Même logique que côté serveur (voir category.service.ts) : le tri appliqué
 * ici sert juste à afficher tout de suite le bon ordre, avant que la vitrine
 * ne le recalcule elle-même côté API. */
function trierProduits(produits: Product[], sortMode: CategorySortMode | undefined): Product[] {
  switch (sortMode) {
    case 'ALPHA_ASC':
      return [...produits].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
    case 'ALPHA_DESC':
      return [...produits].sort((a, b) => b.name.localeCompare(a.name, 'fr', { sensitivity: 'base' }));
    case 'PRICE_ASC':
      return [...produits].sort((a, b) => a.price - b.price);
    case 'PRICE_DESC':
      return [...produits].sort((a, b) => b.price - a.price);
    default:
      return produits;
  }
}

function SortableProduct({ product, onEdit, onDelete, onToggleAvailability, triManuel = true, stats }: any) {
  const t = useTranslations('merchantProducts');
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id, disabled: !triManuel });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const statut =
    product.status === 'ACTIVE' ? null : product.status === 'DRAFT' ? t('statusDraft') : t('statusArchived');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-gray-100 px-3 py-3 last:border-0 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] sm:gap-4 sm:px-4 ${
        isDragging ? 'relative z-10 bg-white shadow-lg' : 'bg-white'
      }`}
    >
      <button
        {...(triManuel ? attributes : {})}
        {...(triManuel ? listeners : {})}
        disabled={!triManuel}
        className={triManuel ? 'cursor-grab text-gray-300 hover:text-gray-500 active:cursor-grabbing' : 'cursor-not-allowed text-gray-200'}
        title={triManuel ? t('dragToReorder') : t('autoSortDisabled')}
        aria-label={triManuel ? t('dragToReorder') : t('autoSortDisabled')}
      >
        <GripVertical size={18} />
      </button>

      {/* La vignette : la photo du plat, ou son initiale ; grisée quand il est épuisé. */}
      {product.media?.[0]?.url ? (
        <img
          src={product.media[0].url}
          alt=""
          className={`h-12 w-12 rounded-xl object-cover sm:h-14 sm:w-14 ${product.isAvailable ? '' : 'opacity-40 grayscale'}`}
        />
      ) : (
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg font-extrabold text-white sm:h-14 sm:w-14 ${
            product.isAvailable ? 'bg-gradient-to-br from-orange-400 to-orange-700' : 'bg-gray-300'
          }`}
          aria-hidden="true"
        >
          {product.name.charAt(0).toUpperCase()}
        </div>
      )}

      <button type="button" onClick={() => onEdit(product)} className="min-w-0 text-left">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`font-extrabold ${product.isAvailable ? 'text-gray-900' : 'text-gray-400'}`}>{product.name}</span>
          {statut && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">{statut}</span>}
          {stats && stats.totalReviews > 0 && (
            <span className="text-xs font-bold text-amber-700">
              ★ {stats.averageRating} ({stats.totalReviews})
            </span>
          )}
        </span>
        {product.description && <span className="block truncate text-sm text-gray-500">{product.description}</span>}
        {/* Sur téléphone, le prix passe sous le nom. */}
        <span className="mt-0.5 block text-sm font-bold tabular-nums sm:hidden">{euro(product.price)}</span>
      </button>

      <b className="hidden tabular-nums sm:block">{euro(product.price)}</b>

      {/* Épuisé ou disponible, d'un geste : seul un plat publié se commande. */}
      {product.status === 'ACTIVE' ? (
        <button
          type="button"
          role="switch"
          aria-checked={product.isAvailable}
          aria-label={`${product.name} : ${product.isAvailable ? t('availableYes') : t('availableNo')}`}
          onClick={() => onToggleAvailability(product)}
          className="flex items-center gap-2"
        >
          <span className={`hidden text-xs font-bold sm:inline ${product.isAvailable ? 'text-green-700' : 'text-red-700'}`}>
            {product.isAvailable ? t('availableYes') : t('availableNo')}
          </span>
          <span className={`relative inline-block h-6 w-10 rounded-full transition ${product.isAvailable ? 'bg-green-600' : 'bg-gray-300'}`}>
            <span
              className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${
                product.isAvailable ? 'left-[19px]' : 'left-[3px]'
              }`}
            />
          </span>
        </button>
      ) : (
        <span className="hidden sm:block" />
      )}

      <div className="col-span-4 flex justify-end gap-1.5 sm:col-span-1">
        <button
          onClick={() => onEdit(product)}
          className="rounded-lg bg-gray-100 p-2 text-gray-700 transition-colors hover:bg-gray-200"
          title={t('edit')}
          aria-label={t('edit')}
        >
          <Edit2 size={16} />
        </button>
        <button
          onClick={() => onDelete(product.id)}
          className="rounded-lg bg-red-50 p-2 text-red-700 transition-colors hover:bg-red-100"
          title={t('delete')}
          aria-label={t('delete')}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const t = useTranslations('merchantProducts');
  const { storeId } = useCurrentStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [productStats, setProductStats] = useState<Record<string, ProductStats>>({});

  const [categories, setCategories] = useState<Array<{ id: string; name: string; sortMode?: CategorySortMode }>>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [message, setMessage] = useState('');
  const [isReordering, setIsReordering] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    isAvailable: true,
    sku: '',
    status: 'ACTIVE' as 'DRAFT' | 'ACTIVE' | 'ARCHIVED',
    categoryId: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchProductsStats = useCallback(async (productList: Product[]) => {
    try {
      const token = localStorage.getItem('accessToken');
      const stats: Record<string, ProductStats> = {};

      for (const product of productList) {
        try {
          const response = await fetch(`${API_URL}/api/reviews/${storeId}/${product.id}/stats`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            const data = await response.json();
            stats[product.id] = data;
          }
        } catch (error) {
          signalerErreur(`Error fetching stats for product ${product.id}:`, error);
        }
      }

      setProductStats(stats);
    } catch (error) {
      signalerErreur('Error fetching products stats:', error);
    }
  }, [storeId]);

  const fetchCategories = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/categories?storeId=${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      signalerErreur('Error fetching categories:', error);
    }
  }, [storeId]);

  const fetchProducts = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/products?storeId=${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const sorted = (data.products || []).sort((a: Product, b: Product) => a.displayOrder - b.displayOrder);
        setProducts(sorted);

        // Charger les stats pour chaque produit
        await fetchProductsStats(sorted);
      }
    } catch (error) {
      signalerErreur('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  }, [storeId, fetchProductsStats]);

  // Un collègue ajoute un plat, le passe en épuisé, réordonne le menu : la
  // liste suit. Une seconde d'attente : chaque relecture relit aussi les avis
  // de chaque plat.
  useDonneesModifiees(
    ['products', 'categories', 'product-media', 'product-tags', 'reviews'],
    () => {
      fetchProducts();
      fetchCategories();
    },
    { storeId, delaiMs: 1000, actif: Boolean(storeId) }
  );

  useEffectChargement(() => {
    if (storeId) {
      fetchProducts();
      fetchCategories();
    }
  }, [storeId, fetchProducts, fetchCategories]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = products.findIndex(p => p.id === active.id);
      const newIndex = products.findIndex(p => p.id === over.id);

      const newOrder = arrayMove(products, oldIndex, newIndex);
      setProducts(newOrder);

      setIsReordering(true);
      try {
        const token = localStorage.getItem('accessToken');

        const ordering = newOrder.map((prod, index) => ({
          id: prod.id,
          displayOrder: index,
        }));

        await fetch(`${API_URL}/api/products/reorder`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ storeId, ordering }),
        });

        setMessage('✅ Produits réorganisés');
        setTimeout(() => setMessage(''), 3000);
      } catch (error) {
        signalerErreur('Error reordering:', error);
        setMessage('❌ Erreur lors de la réorganisation');
        fetchProducts();
      } finally {
        setIsReordering(false);
      }
    }
  };

  /**
   * Le tri d'une catégorie se règle une fois, pour tous ses produits.
   *
   * En mode automatique (alphabétique ou par prix), le glisser-déposer n'a
   * plus de sens : l'ordre se recalcule tout seul, à chaque changement de
   * prix compris.
   */
  const changerTriCategorie = async (categoryId: string, sortMode: CategorySortMode) => {
    const precedent = categories;
    setCategories(prev => prev.map(c => (c.id === categoryId ? { ...c, sortMode } : c)));

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/categories/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sortMode }),
      });

      if (!response.ok) {
        setCategories(precedent);
        setMessage(t('errorSortChange'));
        return;
      }

      setMessage(t('successSortChange'));
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setCategories(precedent);
      setMessage(t('errorConnection'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setMessage(t('errorNameRequired'));
      return;
    }

    if (!formData.price || parseFloat(formData.price) <= 0) {
      setMessage(t('errorPriceInvalid'));
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');

      if (editingProduct) {
        const response = await fetch(`${API_URL}/api/products/${editingProduct.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: formData.name,
            description: formData.description,
            price: parseFloat(formData.price),
            isAvailable: formData.isAvailable,
            sku: formData.sku.trim() || undefined,
            status: formData.status,
            categoryId: formData.categoryId || undefined,
          }),
        });

        if (response.ok) {
          setMessage(t('successProductUpdate'));
          resetForm();
          await fetchProducts();
          setTimeout(() => setMessage(''), 3000);
        } else {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error || errorData.message || t('errorProductUpdate');
          setMessage(`❌ ${errorMsg}`);
        }
      } else {
        if (!storeId) {
          setMessage(t('errorNoStore'));
          return;
        }

        const payload: any = {
          storeId,
          name: formData.name,
          description: formData.description || undefined,
          price: parseFloat(formData.price),
          isAvailable: formData.isAvailable,
          sku: formData.sku.trim() || undefined,
          status: formData.status,
        };

        if (formData.categoryId && formData.categoryId.trim()) {
          payload.categoryId = formData.categoryId;
        }

        const response = await fetch(`${API_URL}/api/products`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          setMessage(t('successProductCreate'));
          resetForm();
          await fetchProducts();
          setTimeout(() => setMessage(''), 3000);
        } else {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error || errorData.message || t('errorProductCreate');
          setMessage(`❌ ${errorMsg}`);
        }
      }
    } catch (error) {
      signalerErreur('Error saving product:', error);
      setMessage(t('errorProductSave'));
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm(t('confirmDelete'))) {
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/products/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setMessage(t('successProductDelete'));
        await fetchProducts();
        setTimeout(() => setMessage(''), 3000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || errorData.message || t('errorProductDelete');
        setMessage(`❌ ${errorMsg}`);
      }
    } catch (error) {
      signalerErreur('Error deleting product:', error);
      setMessage(t('errorProductDelete'));
    }
  };


  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      isAvailable: product.isAvailable ?? true,
      sku: product.sku,
      status: product.status,
      categoryId: product.category?.id || '',
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingProduct(null);
    setFormData({
      name: '',
      description: '',
      price: '',
      isAvailable: true,
        sku: '',
      status: 'ACTIVE',
      categoryId: '',
    });
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const produitsEpuises = products.filter((p) => !p.isAvailable);

  // Une seule bascule remplace l'ajustement chiffré du stock.
  const basculerDisponibilite = async (product: Product) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/products/${product.id}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isAvailable: !product.isAvailable, storeId }),
      });

      const donnees = await response.json();

      if (!response.ok) {
        setMessage(`❌ ${donnees.error || 'Changement impossible'}`);
        return;
      }

      setMessage(`✅ ${donnees.message}`);
      fetchProducts();
    } catch {
      setMessage('❌ Erreur de connexion au serveur');
    }
  };

  const groupedProducts = filteredProducts.reduce((acc, product) => {
    const categoryId = product.category?.id || 'uncategorized';
    if (!acc[categoryId]) {
      const categorie = categories.find(c => c.id === categoryId);
      acc[categoryId] = {
        category: product.category || { id: 'uncategorized', name: t('noCategory') },
        sortMode: categorie?.sortMode || 'MANUAL',
        products: [],
      };
    }
    acc[categoryId].products.push(product);
    return acc;
  }, {} as Record<string, { category: { id: string; name: string }; sortMode: CategorySortMode; products: Product[] }>);

  if (loading) {
    return (
      <div className="flex h-screen">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-500">{t('loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-gray-900">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-3xl font-extrabold tracking-tight">{t('title')}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('summary', { total: products.length, soldOut: produitsEpuises.length })}
            </p>
          </div>
          <label className="flex w-full items-center gap-2 rounded-full bg-white px-4 py-2 ring-1 ring-[#ECECEA] sm:w-64">
            <Search size={16} className="shrink-0 text-gray-500" aria-hidden="true" />
            <span className="sr-only">{t('searchPlaceholder')}</span>
            <input
              type="search"
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-500"
            />
          </label>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-black disabled:opacity-50"
            disabled={isReordering}
          >
            <Plus size={18} /> {t('addButton')}
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-xl text-sm ${
            message.includes('✅')
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {message}
          </div>
        )}

        {produitsEpuises.length > 0 && (
          <div className="rounded-[18px] border border-orange-200 bg-orange-50 p-4">
            <div className="flex gap-3">
              <AlertCircle size={20} className="text-orange-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-orange-900 mb-2">
                  {t('outOfStockProducts', { count: produitsEpuises.length })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {produitsEpuises.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => basculerDisponibilite(p)}
                      className="rounded-full border border-orange-200 bg-white px-3 py-1 text-sm font-bold text-orange-900 transition-colors hover:border-orange-600"
                      title={t('restockButton')}
                    >
                      {p.name} ↺
                    </button>
                  ))}
                  {produitsEpuises.length > 6 && (
                    <span className="text-orange-800 text-sm">
                      +{produitsEpuises.length - 6}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
          {/* Les catégories, pour sauter de l'une à l'autre dans un long menu. */}
          <nav aria-label={t('categoriesNav')} className="hidden flex-col gap-0.5 text-sm lg:sticky lg:top-24 lg:flex">
            <span className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">{t('categoriesNav')}</span>
            {Object.values(groupedProducts).map((group) => (
              <a
                key={group.category.id}
                href={`#categorie-${group.category.id}`}
                className="flex justify-between rounded-[10px] px-3 py-2 font-semibold text-gray-700 hover:bg-white hover:text-gray-900"
              >
                <span className="truncate">{group.category.name}</span>
                <span className="text-gray-400">{group.products.length}</span>
              </a>
            ))}
          </nav>

        <div className="space-y-4">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 bg-white border border-[#ECECEA] rounded-[18px]">
              <p className="text-gray-500">{t('empty')}</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={filteredProducts.map(p => p.id)}
                strategy={verticalListSortingStrategy}
                disabled={isReordering}
              >
                {Object.values(groupedProducts).map(group => {
                  const produitsAffiches = trierProduits(group.products, group.sortMode);
                  const triManuel = group.sortMode === 'MANUAL' || group.sortMode === undefined;

                  return (
                    <section
                      key={group.category.id}
                      id={`categorie-${group.category.id}`}
                      className="scroll-mt-24 overflow-hidden rounded-[18px] border border-[#ECECEA] bg-white"
                    >
                      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
                        <h2 className="text-lg font-extrabold">{group.category.name}</h2>
                        <span className="text-sm text-gray-500">{t('productCount', { count: group.products.length })}</span>
                        {group.category.id !== 'uncategorized' && (
                          <select
                            value={group.sortMode}
                            onChange={(e) => changerTriCategorie(group.category.id, e.target.value as CategorySortMode)}
                            className="ml-auto rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-semibold text-gray-800 focus:outline-none focus:border-orange-500"
                            title={t('sortTitle')}
                          >
                            <option value="MANUAL">{t('sortMode_manual')}</option>
                            <option value="ALPHA_ASC">{t('sortMode_alpha_asc')}</option>
                            <option value="ALPHA_DESC">{t('sortMode_alpha_desc')}</option>
                            <option value="PRICE_ASC">{t('sortMode_price_asc')}</option>
                            <option value="PRICE_DESC">{t('sortMode_price_desc')}</option>
                          </select>
                        )}
                      </div>
                      <div>
                        {produitsAffiches.map(product => (
                          <SortableProduct
                            key={product.id}
                            product={product}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onToggleAvailability={basculerDisponibilite}
                            triManuel={triManuel}
                            stats={productStats[product.id]}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </SortableContext>
            </DndContext>
          )}
        </div>
        </div>
      </div>

      {showForm && (
        // Un panneau sur le côté : le menu reste visible derrière pendant qu'on modifie un plat.
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titre-produit"
            className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
              <h2 id="titre-produit" className="text-xl font-extrabold">
                {editingProduct ? editingProduct.name : t('formTitle_add')}
              </h2>
              <button
                onClick={resetForm}
                aria-label={t('formButton_cancel')}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-gray-700">{t('formLabel_name')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:border-orange-500"
                  placeholder={t('formPlaceholder_name')}
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-gray-700">{t('formLabel_sku')}</label>
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:border-orange-500"
                  placeholder={t('formPlaceholder_sku')}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-gray-700">{t('formLabel_category')}</label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:border-orange-500"
                >
                  <option value="">{t('formSelect_category')}</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-gray-700">{t('formLabel_description')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:border-orange-500"
                  placeholder={t('formPlaceholder_description')}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-gray-700">{t('formLabel_price')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:border-orange-500"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-gray-700">{t('formLabel_availability')}</label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isAvailable: !formData.isAvailable })}
                    className={`w-full px-3 py-2 rounded font-medium transition-colors ${
                      formData.isAvailable
                        ? 'bg-green-50 text-green-600 border border-green-200'
                        : 'bg-orange-50 text-orange-600 border border-orange-200'
                    }`}
                  >
                    {formData.isAvailable ? t('formButton_available') : t('formButton_exhausted')}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-gray-700">{t('formLabel_status')}</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:border-orange-500"
                >
                  <option value="DRAFT">{t('statusDraft')}</option>
                  <option value="ACTIVE">{t('statusActive')}</option>
                  <option value="ARCHIVED">{t('statusArchived')}</option>
                </select>
              </div>

              <div className="grid grid-cols-[1fr_2fr] gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-full border border-gray-200 py-2.5 text-sm font-bold transition-colors hover:bg-gray-50"
                >
                  {t('formButton_cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-orange-600 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-orange-700"
                >
                  {editingProduct ? t('formButton_update') : t('formButton_create')}
                </button>
              </div>
            </form>

            {/* Les tailles et les suppléments d'un plat existant : ils
                s'enregistrent d'eux-mêmes, à part du formulaire. */}
            {editingProduct && (
              <div className="space-y-2 border-t border-gray-100 px-6 pb-8 pt-2">
                <DeclinaisonsProduit productId={editingProduct.id} prixDuPlat={Number(editingProduct.price)} />
                <SupplementsProduit productId={editingProduct.id} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
