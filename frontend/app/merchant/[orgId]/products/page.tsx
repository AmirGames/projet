'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Edit2, Trash2, Search, AlertCircle, Package, GripVertical } from 'lucide-react';
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  lowStockThreshold: number;
  sku: string;
  displayOrder: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  category?: {
    id: string;
    name: string;
  };
  createdAt: string;
}

function SortableProduct({ product, onEdit, onDelete, isLowStock, adjustStock }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg p-4 transition-colors ${
        isLowStock(product)
          ? 'bg-yellow-600/10 border-yellow-600/50 hover:border-yellow-600'
          : 'bg-gray-800 border-gray-700 hover:border-red-600'
      } ${isDragging ? 'shadow-lg shadow-red-600' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 mt-1"
            title="Glissez pour réorganiser"
          >
            <GripVertical size={18} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-bold">{product.name}</h3>
              {isLowStock(product) && (
                <AlertCircle size={16} className="text-yellow-400" />
              )}
              <span className={`text-xs px-2 py-1 rounded ${
                product.status === 'ACTIVE'
                  ? 'bg-green-600/30 text-green-400'
                  : product.status === 'DRAFT'
                  ? 'bg-gray-600/30 text-gray-400'
                  : 'bg-red-600/30 text-red-400'
              }`}>
                {product.status}
              </span>
            </div>
            {product.description && (
              <p className="text-sm text-gray-400 mb-2">{product.description}</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Prix</p>
                <p className="font-semibold text-red-400">${(product.price / 100).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-gray-500">SKU</p>
                <p className="font-mono text-sm">{product.sku}</p>
              </div>
              <div>
                <p className="text-gray-500">Stock</p>
                <p className={`font-semibold ${isLowStock(product) ? 'text-yellow-400' : 'text-green-400'}`}>
                  {product.stock} unité{product.stock !== 1 ? 's' : ''}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Seuil d'alerte</p>
                <p className="font-semibold text-blue-400">{product.lowStockThreshold}</p>
              </div>
            </div>
            {product.category && (
              <div className="mt-2">
                <span className="text-xs bg-blue-600/30 text-blue-400 px-2 py-1 rounded">
                  {product.category.name}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onEdit(product)}
            className="p-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            title="Modifier"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => onDelete(product.id)}
            className="p-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
            title="Supprimer"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {product.status === 'ACTIVE' && (
        <div className="mt-4 pt-4 border-t border-gray-700 flex items-center gap-2">
          <Package size={16} className="text-gray-500" />
          <button
            onClick={() => adjustStock(product.id, -5)}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
          >
            -5
          </button>
          <button
            onClick={() => adjustStock(product.id, -1)}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
          >
            -1
          </button>
          <button
            onClick={() => adjustStock(product.id, 1)}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
          >
            +1
          </button>
          <button
            onClick={() => adjustStock(product.id, 5)}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
          >
            +5
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  const params = useParams();
  const orgId = params?.orgId as string;

  const [products, setProducts] = useState<Product[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
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
    stock: '',
    lowStockThreshold: '10',
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

  useEffect(() => {
    if (orgId) {
      fetchProducts();
      fetchLowStockProducts();
      fetchCategories();
    }
  }, [orgId]);

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/categories?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/products?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const sorted = (data.products || []).sort((a: Product, b: Product) => a.displayOrder - b.displayOrder);
        setProducts(sorted);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLowStockProducts = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/products/low-stock/by-org/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setLowStockProducts(data.products || []);
      }
    } catch (error) {
      console.error('Error fetching low stock products:', error);
    }
  };

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
        const storeResponse = await fetch(`${API_URL}/api/stores/org/${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const storeList = await storeResponse.json();
        const storeId = storeList[0]?.id;

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
        console.error('Error reordering:', error);
        setMessage('❌ Erreur lors de la réorganisation');
        fetchProducts();
      } finally {
        setIsReordering(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setMessage('❌ Le nom du produit est requis');
      return;
    }

    if (!formData.price || parseFloat(formData.price) <= 0) {
      setMessage('❌ Le prix doit être supérieur à 0');
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
            stock: parseInt(formData.stock),
            sku: formData.sku,
            status: formData.status,
            categoryId: formData.categoryId || undefined,
          }),
        });

        if (response.ok) {
          setMessage('✅ Produit mis à jour');
          resetForm();
          await fetchProducts();
          if (parseInt(formData.stock) <= parseInt(formData.lowStockThreshold)) {
            await updateLowStockThreshold(editingProduct.id, parseInt(formData.lowStockThreshold));
          }
          setTimeout(() => setMessage(''), 3000);
        } else {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.message || 'Erreur lors de la mise à jour';
          setMessage(`❌ ${errorMsg}`);
        }
      } else {
        const storeResponse = await fetch(`${API_URL}/api/stores/org/${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const stores = await storeResponse.json();
        const storeId = stores[0]?.id;

        if (!storeId) {
          setMessage('❌ Aucune boutique trouvée pour cette organisation');
          return;
        }

        const payload: any = {
          storeId,
          name: formData.name,
          description: formData.description || undefined,
          price: parseFloat(formData.price),
          stock: parseInt(formData.stock) || 0,
          sku: formData.sku,
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
          setMessage('✅ Produit créé');
          resetForm();
          await fetchProducts();
          setTimeout(() => setMessage(''), 3000);
        } else {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.message || 'Erreur lors de la création';
          setMessage(`❌ ${errorMsg}`);
        }
      }
    } catch (error) {
      console.error('Error saving product:', error);
      setMessage('❌ Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit?')) {
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/products/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setMessage('✅ Produit supprimé');
        await fetchProducts();
        setTimeout(() => setMessage(''), 3000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.message || 'Erreur lors de la suppression';
        setMessage(`❌ ${errorMsg}`);
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      setMessage('❌ Erreur lors de la suppression');
    }
  };

  const updateLowStockThreshold = async (productId: string, threshold: number) => {
    try {
      const token = localStorage.getItem('accessToken');
      await fetch(`${API_URL}/api/products/${productId}/low-stock-threshold`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threshold }),
      });
      fetchLowStockProducts();
    } catch (error) {
      console.error('Error updating threshold:', error);
    }
  };

  const adjustStock = async (productId: string, quantity: number) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/products/${productId}/stock`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quantity }),
      });

      if (response.ok) {
        const updated = await response.json();
        setProducts(prev => prev.map(p => p.id === productId ? updated.product : p));
        fetchLowStockProducts();
      }
    } catch (error) {
      console.error('Error adjusting stock:', error);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      stock: product.stock.toString(),
      lowStockThreshold: product.lowStockThreshold.toString(),
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
      stock: '',
      lowStockThreshold: '10',
      sku: '',
      status: 'ACTIVE',
      categoryId: '',
    });
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isLowStock = (product: Product) => product.stock <= product.lowStockThreshold;

  const groupedProducts = filteredProducts.reduce((acc, product) => {
    const categoryId = product.category?.id || 'uncategorized';
    if (!acc[categoryId]) {
      acc[categoryId] = {
        category: product.category || { id: 'uncategorized', name: 'Sans catégorie' },
        products: [],
      };
    }
    acc[categoryId].products.push(product);
    return acc;
  }, {} as Record<string, { category: { id: string; name: string }; products: Product[] }>);

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-900">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-400">Chargement des produits...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">📦 Gestion des Produits</h1>
            <p className="text-gray-400 mt-1">Gérez votre inventaire et les stocks (glissez pour réorganiser)</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
            disabled={isReordering}
          >
            <Plus size={20} /> Ajouter Produit
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-lg ${
            message.includes('✅')
              ? 'bg-green-600/20 border border-green-600/50 text-green-400'
              : 'bg-red-600/20 border border-red-600/50 text-red-400'
          }`}>
            {message}
          </div>
        )}

        {lowStockProducts.length > 0 && (
          <div className="bg-yellow-600/20 border border-yellow-600/50 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle size={20} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-yellow-400 mb-2">
                  ⚠️ {lowStockProducts.length} produit{lowStockProducts.length > 1 ? 's' : ''} en rupture ou faible stock
                </p>
                <div className="flex flex-wrap gap-2">
                  {lowStockProducts.slice(0, 5).map(p => (
                    <span key={p.id} className="bg-yellow-700/30 px-2 py-1 rounded text-sm">
                      {p.name}: {p.stock} unité{p.stock !== 1 ? 's' : ''}
                    </span>
                  ))}
                  {lowStockProducts.length > 5 && (
                    <span className="text-yellow-300 text-sm">+{lowStockProducts.length - 5} autres</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Total de produits</p>
            <p className="text-3xl font-bold">{products.length}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Produits actifs</p>
            <p className="text-3xl font-bold">{products.filter(p => p.status === 'ACTIVE').length}</p>
          </div>
          <div className="bg-yellow-600/20 border border-yellow-600/50 rounded-lg p-4">
            <p className="text-yellow-400 text-sm">Stock bas</p>
            <p className="text-3xl font-bold text-yellow-400">{lowStockProducts.length}</p>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex gap-3">
            <Search size={20} className="text-gray-500 mt-2" />
            <input
              type="text"
              placeholder="Rechercher par nom ou SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        <div className="space-y-6">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 border border-gray-700 rounded-lg">
              <p className="text-gray-400">Aucun produit trouvé</p>
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
                {Object.values(groupedProducts).map(group => (
                  <div key={group.category.id} className="space-y-3">
                    <div className="flex items-center gap-3 pt-2">
                      <h2 className="text-xl font-bold">{group.category.name}</h2>
                      <span className="text-sm text-gray-400">({group.products.length} produit{group.products.length !== 1 ? 's' : ''})</span>
                    </div>
                    <div className="space-y-3 pl-4 border-l-2 border-red-600">
                      {group.products.map(product => (
                        <SortableProduct
                          key={product.id}
                          product={product}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          isLowStock={isLowStock}
                          adjustStock={adjustStock}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="border-b border-gray-700 p-6 flex items-center justify-between sticky top-0 bg-gray-800">
              <h2 className="text-2xl font-bold">
                {editingProduct ? 'Modifier Produit' : 'Ajouter Produit'}
              </h2>
              <button
                onClick={resetForm}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-2">Nom du produit *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  placeholder="Ex: Pizza Margherita"
                  required
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-2">SKU (optionnel)</label>
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  placeholder="Ex: PIZZA-001 (auto-généré si vide)"
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-2">Catégorie</label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                >
                  <option value="">Sélectionner une catégorie</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  placeholder="Détails du produit..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-400 block mb-2">Prix ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-2">Stock *</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                    placeholder="0"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-2">Seuil d'alerte stock</label>
                <input
                  type="number"
                  min="0"
                  value={formData.lowStockThreshold}
                  onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  placeholder="10"
                />
                <p className="text-xs text-gray-500 mt-1">Vous serez alerté quand le stock passe sous ce seuil</p>
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-2">Statut</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                >
                  <option value="DRAFT">Brouillon</option>
                  <option value="ACTIVE">Actif</option>
                  <option value="ARCHIVED">Archivé</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded font-semibold transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold transition-colors"
                >
                  {editingProduct ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
