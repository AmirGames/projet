'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Edit2, Trash2, Search, AlertCircle, Package } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  lowStockThreshold: number;
  sku: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  category?: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export default function ProductsPage() {
  const params = useParams();
  const orgId = params?.orgId as string;

  const [products, setProducts] = useState<Product[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    stock: '',
    lowStockThreshold: '10',
    sku: '',
    status: 'ACTIVE' as 'DRAFT' | 'ACTIVE' | 'ARCHIVED',
  });

  useEffect(() => {
    if (orgId) {
      fetchProducts();
      fetchLowStockProducts();
    }
  }, [orgId]);

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/products?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setProducts(data.products || []);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setMessage('❌ Le nom du produit est requis');
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
          }),
        });

        if (response.ok) {
          const updated = await response.json();
          setProducts(prev => prev.map(p => p.id === editingProduct.id ? updated.product : p));
          setMessage('✅ Produit mis à jour');
          resetForm();
          setTimeout(() => setMessage(''), 3000);

          if (parseInt(formData.stock) <= parseInt(formData.lowStockThreshold)) {
            await updateLowStockThreshold(editingProduct.id, parseInt(formData.lowStockThreshold));
          }
        } else {
          setMessage('❌ Erreur lors de la mise à jour');
        }
      } else {
        const storeResponse = await fetch(`${API_URL}/api/stores/${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const storeData = await storeResponse.json();
        const storeId = storeData.store?.id || storeData.id;

        const response = await fetch(`${API_URL}/api/products`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storeId,
            name: formData.name,
            description: formData.description,
            price: parseFloat(formData.price),
            stock: parseInt(formData.stock),
            sku: formData.sku,
            status: formData.status,
          }),
        });

        if (response.ok) {
          const created = await response.json();
          setProducts(prev => [created.product, ...prev]);
          setMessage('✅ Produit créé');
          resetForm();
          setTimeout(() => setMessage(''), 3000);
        } else {
          setMessage('❌ Erreur lors de la création');
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
        setProducts(prev => prev.filter(p => p.id !== productId));
        setMessage('✅ Produit supprimé');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('❌ Erreur lors de la suppression');
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
    });
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isLowStock = (product: Product) => product.stock <= product.lowStockThreshold;

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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">📦 Gestion des Produits</h1>
            <p className="text-gray-400 mt-1">Gérez votre inventaire et les stocks</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors"
          >
            <Plus size={20} /> Ajouter Produit
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg ${
            message.includes('✅')
              ? 'bg-green-600/20 border border-green-600/50 text-green-400'
              : 'bg-red-600/20 border border-red-600/50 text-red-400'
          }`}>
            {message}
          </div>
        )}

        {/* Low Stock Alert */}
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

        {/* Stats */}
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

        {/* Search */}
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

        {/* Products List */}
        <div className="space-y-3">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 border border-gray-700 rounded-lg">
              <p className="text-gray-400">Aucun produit trouvé</p>
            </div>
          ) : (
            filteredProducts.map(product => (
              <div
                key={product.id}
                className={`border rounded-lg p-4 transition-colors ${
                  isLowStock(product)
                    ? 'bg-yellow-600/10 border-yellow-600/50 hover:border-yellow-600'
                    : 'bg-gray-800 border-gray-700 hover:border-red-600'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
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

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleEdit(product)}
                      className="p-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                      title="Modifier"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="p-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Quick Stock Adjustment */}
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
            ))
          )}
        </div>
      </div>

      {/* Product Form Modal */}
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
                <label className="text-sm text-gray-400 block mb-2">SKU *</label>
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  placeholder="Ex: PIZZA-001"
                  required
                />
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
