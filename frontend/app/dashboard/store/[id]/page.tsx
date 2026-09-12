'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus, Settings, Package, Trash2, Edit2, Clock, Tag, ShoppingCart, X, TrendingUp } from 'lucide-react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  operatingHours?: Record<string, { open: string; close: string }>;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  categoryId?: string;
}

interface Category {
  id: string;
  name: string;
}

interface Order {
  id: string;
  customerName: string;
  totalAmount: number;
  status: string;
  createdAt: string;
}

interface HourlyStats {
  hour: number;
  count: number;
  revenue: number;
  orders: Order[];
}

export default function StoreManagementPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = params?.id as string;
  const slug = searchParams?.get('slug') as string;

  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('info');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  // Form states
  const [storeForm, setStoreForm] = useState({
    name: '', description: '', address: '', phone: '', email: '',
  });
  
  const [productForm, setProductForm] = useState({ name: '', description: '', price: '', stock: '', categoryId: '' });
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  
  const [hours, setHours] = useState({
    Monday: { open: '09:00', close: '18:00' },
    Tuesday: { open: '09:00', close: '18:00' },
    Wednesday: { open: '09:00', close: '18:00' },
    Thursday: { open: '09:00', close: '18:00' },
    Friday: { open: '09:00', close: '20:00' },
    Saturday: { open: '10:00', close: '20:00' },
    Sunday: { open: '10:00', close: '18:00' },
  });

  useEffect(() => {
    loadStore();
  }, [slug, router]);

  const getHourlyStats = (): HourlyStats[] => {
    const stats: Record<number, { count: number; revenue: number; orders: Order[] }> = {};

    for (let i = 0; i < 24; i++) {
      stats[i] = { count: 0, revenue: 0, orders: [] };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    orders.forEach((order) => {
      const orderDate = new Date(order.createdAt);
      orderDate.setHours(0, 0, 0, 0);

      if (orderDate.getTime() === today.getTime()) {
        const hour = new Date(order.createdAt).getHours();
        stats[hour].count += 1;
        stats[hour].revenue += order.totalAmount;
        stats[hour].orders.push(order);
      }
    });

    return Object.entries(stats).map(([hour, data]) => ({
      hour: parseInt(hour),
      count: data.count,
      revenue: data.revenue,
      orders: data.orders,
    }));
  };

  const loadStore = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) { router.push('/login'); return; }

      const response = await fetch(`${API_URL}/api/stores/slug/${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const storeData = data.store || data;
        setStore(storeData);
        setStoreForm({
          name: storeData.name || '',
          description: storeData.description || '',
          address: storeData.address || '',
          phone: storeData.phone || '',
          email: storeData.email || '',
        });
        
        if (storeData.operatingHours) setHours(storeData.operatingHours);
        
        // Load products
        const productsRes = await fetch(`${API_URL}/api/products?storeId=${storeData.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (productsRes.ok) {
          const productsData = await productsRes.json();
          setProducts(productsData.products || []);
        }

        // Load categories
        const categoriesRes = await fetch(`${API_URL}/api/categories?storeId=${storeData.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (categoriesRes.ok) {
          const categoriesData = await categoriesRes.json();
          setCategories(Array.isArray(categoriesData) ? categoriesData : categoriesData.categories || []);
        }

        // Load orders
        const ordersRes = await fetch(`${API_URL}/api/orders?storeId=${storeData.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (ordersRes.ok) {
          const ordersData = await ordersRes.json();
          setOrders(Array.isArray(ordersData) ? ordersData : ordersData.orders || []);
        }
      }
    } catch (err) {
      console.error('Error loading store:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('accessToken');
      if (!store || !token) return;

      const response = await fetch(`${API_URL}/api/stores/${store.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...storeForm, operatingHours: hours }),
      });

      if (response.ok) alert('Boutique mise à jour !');
    } catch (err) {
      console.error('Error saving store:', err);
      alert('Erreur lors de la sauvegarde');
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('accessToken');
      if (!store || !token) return;

      const method = editingProduct ? 'PUT' : 'POST';
      const url = editingProduct ? `${API_URL}/api/products/${editingProduct.id}` : `${API_URL}/api/products`;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId: store.id,
          name: productForm.name,
          description: productForm.description,
          price: parseInt(productForm.price) * 100,
          stock: parseInt(productForm.stock),
          categoryId: productForm.categoryId || null,
        }),
      });

      if (response.ok) {
        alert(editingProduct ? 'Produit mis à jour !' : 'Produit ajouté !');
        loadStore();
        setShowProductModal(false);
        setProductForm({ name: '', description: '', price: '', stock: '', categoryId: '' });
        setEditingProduct(null);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Erreur lors de l\'opération');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Supprimer ce produit ?')) return;
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/api/products/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        alert('Produit supprimé !');
        loadStore();
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Erreur lors de la suppression');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('accessToken');
      if (!store || !token) return;

      const response = await fetch(`${API_URL}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId: store.id, name: categoryForm.name }),
      });

      if (response.ok) {
        alert('Catégorie ajoutée !');
        loadStore();
        setShowCategoryModal(false);
        setCategoryForm({ name: '' });
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Erreur lors de l\'opération');
    }
  };

  const handleSaveHours = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!store || !token) return;

      const response = await fetch(`${API_URL}/api/stores/${store.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...storeForm, operatingHours: hours }),
      });

      if (response.ok) alert('Horaires mises à jour !');
    } catch (err) {
      console.error('Error:', err);
      alert('Erreur lors de la sauvegarde');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <p className="text-white">Chargement...</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <p className="text-white">Boutique non trouvée</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-6">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2 text-blue-400 hover:text-blue-300">
            <ArrowLeft size={20} /> Retour
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{store.name}</h1>
            <p className="text-gray-400 text-sm">Gestion complète</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto border-b border-gray-700 pb-4">
          {[
            { id: 'info', label: 'Informations', icon: Settings },
            { id: 'products', label: 'Produits', icon: Package },
            { id: 'categories', label: 'Catégories', icon: Tag },
            { id: 'hours', label: 'Horaires', icon: Clock },
            { id: 'daily-stats', label: 'Statistiques', icon: TrendingUp },
            { id: 'orders', label: 'Commandes', icon: ShoppingCart },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-4 px-4 flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Info Tab */}
        {activeTab === 'info' && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
            <h2 className="text-2xl font-bold">Informations</h2>
            <form onSubmit={handleSaveStore} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Nom</label>
                <input
                  type="text"
                  value={storeForm.name}
                  onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={storeForm.description}
                  onChange={(e) => setStoreForm({ ...storeForm, description: e.target.value })}
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Adresse</label>
                <input
                  type="text"
                  value={storeForm.address}
                  onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Téléphone</label>
                  <input
                    type="tel"
                    value={storeForm.phone}
                    onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    value={storeForm.email}
                    onChange={(e) => setStoreForm({ ...storeForm, email: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 rounded-lg px-6 py-3 font-medium transition-colors">
                Sauvegarder
              </button>
            </form>
          </div>
        )}

        {/* Products Tab */}
        {activeTab === 'products' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Produits</h2>
              <button
                onClick={() => { setShowProductModal(true); setEditingProduct(null); setProductForm({ name: '', description: '', price: '', stock: '', categoryId: '' }); }}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-medium"
              >
                <Plus size={20} /> Ajouter
              </button>
            </div>
            <div className="grid gap-4">
              {products.length === 0 ? (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
                  <p className="text-gray-400">Aucun produit</p>
                </div>
              ) : (
                products.map((product) => (
                  <div key={product.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold">{product.name}</h3>
                      <p className="text-gray-400 text-sm">{product.description}</p>
                      <p className="text-green-400 text-sm mt-1">€{(product.price / 100).toFixed(2)} • Stock: {product.stock}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingProduct(product); setProductForm({ name: product.name, description: product.description, price: String(product.price / 100), stock: String(product.stock), categoryId: product.categoryId || '' }); setShowProductModal(true); }}
                        className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="p-2 bg-red-600 hover:bg-red-700 rounded-lg"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === 'categories' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Catégories</h2>
              <button
                onClick={() => setShowCategoryModal(true)}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-medium"
              >
                <Plus size={20} /> Ajouter
              </button>
            </div>
            <div className="grid gap-4">
              {categories.length === 0 ? (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
                  <p className="text-gray-400">Aucune catégorie</p>
                </div>
              ) : (
                categories.map((category) => (
                  <div key={category.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                    <h3 className="font-bold">{category.name}</h3>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Hours Tab */}
        {activeTab === 'hours' && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
            <h2 className="text-2xl font-bold">Horaires d'Ouverture</h2>
            <div className="grid gap-4">
              {Object.entries(hours).map(([day, times]) => (
                <div key={day} className="flex items-center gap-4">
                  <label className="w-24 font-medium">{day}</label>
                  <input
                    type="time"
                    value={times.open}
                    onChange={(e) => setHours({ ...hours, [day]: { ...times, open: e.target.value } })}
                    className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-gray-400">à</span>
                  <input
                    type="time"
                    value={times.close}
                    onChange={(e) => setHours({ ...hours, [day]: { ...times, close: e.target.value } })}
                    className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
            <button onClick={handleSaveHours} className="w-full bg-blue-600 hover:bg-blue-700 rounded-lg px-6 py-3 font-medium transition-colors">
              Sauvegarder les horaires
            </button>
          </div>
        )}

        {/* Daily Stats Tab */}
        {activeTab === 'daily-stats' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Statistiques du Jour</h2>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <p className="text-gray-400 text-sm">Total Commandes</p>
                <p className="text-3xl font-bold mt-2">{getHourlyStats().reduce((sum, h) => sum + h.count, 0)}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <p className="text-gray-400 text-sm">Chiffre d'Affaires</p>
                <p className="text-3xl font-bold text-green-400 mt-2">€{(getHourlyStats().reduce((sum, h) => sum + h.revenue, 0) / 100).toFixed(2)}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <p className="text-gray-400 text-sm">Panier Moyen</p>
                <p className="text-3xl font-bold mt-2">
                  €{getHourlyStats().reduce((sum, h) => sum + h.count, 0) > 0
                    ? (getHourlyStats().reduce((sum, h) => sum + h.revenue, 0) / getHourlyStats().reduce((sum, h) => sum + h.count, 0) / 100).toFixed(2)
                    : '0.00'}
                </p>
              </div>
            </div>

            {/* Hourly Stats Table */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold">Heure</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">Commandes</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">Chiffre d'Affaires</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">Barre (Max 10)</th>
                  </tr>
                </thead>
                <tbody>
                  {getHourlyStats().map((stat) => (
                    <tr key={stat.hour} className="border-t border-gray-700 hover:bg-gray-700">
                      <td className="px-6 py-4 font-medium">{String(stat.hour).padStart(2, '0')}:00</td>
                      <td className="px-6 py-4">{stat.count}</td>
                      <td className="px-6 py-4 text-green-400">€{(stat.revenue / 100).toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-32 bg-gray-700 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-blue-500 h-full transition-all"
                              style={{ width: `${Math.min((stat.count / 10) * 100, 100)}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-400">{stat.count > 0 ? (stat.count / 10 * 100).toFixed(0) + '%' : '0%'}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Hourly Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold">Détails par Heure</h3>
              {getHourlyStats().filter(s => s.count > 0).length === 0 ? (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
                  <p className="text-gray-400">Aucune commande aujourd'hui</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {getHourlyStats().filter(s => s.count > 0).map((stat) => (
                    <div key={stat.hour} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold text-lg">{String(stat.hour).padStart(2, '0')}:00 - {String(stat.hour + 1).padStart(2, '0')}:00</h4>
                        <div className="text-right">
                          <p className="text-gray-400 text-sm">{stat.count} commande{stat.count > 1 ? 's' : ''}</p>
                          <p className="text-green-400 font-medium">€{(stat.revenue / 100).toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {stat.orders.map((order) => (
                          <div key={order.id} className="flex justify-between text-sm bg-gray-700 p-2 rounded">
                            <span className="text-gray-300">{order.customerName}</span>
                            <span className="text-green-400">€{(order.totalAmount / 100).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Commandes</h2>
            <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold">Client</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">Montant</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">Statut</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                        Aucune commande
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.id} className="border-t border-gray-700">
                        <td className="px-6 py-4">{order.customerName}</td>
                        <td className="px-6 py-4">€{(order.totalAmount / 100).toFixed(2)}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            order.status === 'COMPLETED' ? 'bg-green-900 text-green-300' :
                            order.status === 'PENDING' ? 'bg-yellow-900 text-yellow-300' :
                            'bg-red-900 text-red-300'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-400">{new Date(order.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">{editingProduct ? 'Modifier' : 'Ajouter'} un produit</h2>
              <button onClick={() => setShowProductModal(false)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Nom</label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  rows={2}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Prix (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Stock</label>
                  <input
                    type="number"
                    value={productForm.stock}
                    onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Catégorie</label>
                <select
                  value={productForm.categoryId}
                  onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Sans catégorie</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 rounded-lg px-6 py-3 font-medium transition-colors">
                {editingProduct ? 'Modifier' : 'Ajouter'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Ajouter une catégorie</h2>
              <button onClick={() => setShowCategoryModal(false)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Nom</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 rounded-lg px-6 py-3 font-medium transition-colors">
                Ajouter
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
