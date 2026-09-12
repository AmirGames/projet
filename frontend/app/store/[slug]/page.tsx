'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ShoppingCart, MapPin, Phone, Clock, Star } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  images: Array<{ url: string }>;
}

interface Category {
  id: string;
  name: string;
  products: Product[];
}

export default function StorefrontPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [store, setStore] = useState<Store | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    if (slug) {
      fetchStoreData();
    }
  }, [slug]);

  const fetchStoreData = async () => {
    try {
      const response = await fetch(`${API_URL}/api/stores/slug/${slug}`);
      if (response.ok) {
        const data = await response.json();
        setStore(data.store);

        // Fetch categories and products
        const productsResponse = await fetch(`${API_URL}/api/products?storeId=${data.store.id}`);
        if (productsResponse.ok) {
          const productsData = await productsResponse.json();
          // Group products by category
          const grouped: { [key: string]: Category } = {};
          productsData.products.forEach((product: Product & { categoryId: string; category: { id: string; name: string } }) => {
            const categoryId = product.category?.id || 'uncategorized';
            const categoryName = product.category?.name || 'Autres';

            if (!grouped[categoryId]) {
              grouped[categoryId] = {
                id: categoryId,
                name: categoryName,
                products: [],
              };
            }
            grouped[categoryId].products.push(product);
          });

          setCategories(Object.values(grouped));
        }
      }
    } catch (error) {
      console.error('Error fetching store:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(prev =>
        prev.map(item =>
          item.product.id === productId
            ? { ...item, quantity }
            : item
        )
      );
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-400">Chargement de la boutique...</p>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-gray-400 text-lg">Boutique non trouvée</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header with Store Info */}
      <header className="bg-gradient-to-r from-red-600 to-orange-600 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">{store.name}</h1>
              <p className="text-white/90 max-w-2xl">{store.description}</p>
            </div>
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative bg-white text-red-600 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-100 transition-colors"
            >
              <ShoppingCart size={20} />
              Panier
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                  {cart.length}
                </span>
              )}
            </button>
          </div>

          {/* Store Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-white text-sm">
            {store.address && (
              <div className="flex items-center gap-2">
                <MapPin size={18} />
                <span>{store.address}{store.postalCode ? ', ' + store.postalCode : ''}{store.city ? ' ' + store.city : ''}</span>
              </div>
            )}
            {store.phone && (
              <div className="flex items-center gap-2">
                <Phone size={18} />
                <span>{store.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock size={18} />
              <span>Ouvert</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Main Content */}
        <main className={`flex-1 transition-all ${showCart ? 'max-w-4xl' : 'w-full'}`}>
          <div className="max-w-6xl mx-auto p-6 space-y-8">
            {categories.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg">Aucun produit disponible pour le moment</p>
              </div>
            ) : (
              categories.map(category => (
                <section key={category.id}>
                  <h2 className="text-2xl font-bold mb-4 text-white">{category.name}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {category.products.map(product => (
                      <div
                        key={product.id}
                        className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden hover:border-red-600 transition-colors"
                      >
                        {/* Product Image */}
                        {product.images && product.images.length > 0 ? (
                          <img
                            src={product.images[0].url}
                            alt={product.name}
                            className="w-full h-48 object-cover bg-gray-700"
                          />
                        ) : (
                          <div className="w-full h-48 bg-gray-700 flex items-center justify-center">
                            <span className="text-4xl">🍽️</span>
                          </div>
                        )}

                        {/* Product Info */}
                        <div className="p-4 space-y-3">
                          <h3 className="font-bold text-lg">{product.name}</h3>
                          <p className="text-gray-400 text-sm">{product.description}</p>

                          {/* Rating */}
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                size={16}
                                className={i < 4 ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600'}
                              />
                            ))}
                            <span className="text-xs text-gray-500 ml-2">(24 avis)</span>
                          </div>

                          {/* Price & Stock */}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-2xl font-bold text-red-400">${(product.price / 100).toFixed(2)}</p>
                              <p className="text-xs text-gray-500">
                                {product.stock > 0 ? `${product.stock} en stock` : 'Rupture'}
                              </p>
                            </div>
                          </div>

                          {/* Add to Cart Button */}
                          <button
                            onClick={() => addToCart(product)}
                            disabled={product.stock === 0}
                            className={`w-full py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors ${
                              product.stock === 0
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700 text-white'
                            }`}
                          >
                            <ShoppingCart size={18} />
                            Ajouter au panier
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </main>

        {/* Shopping Cart Sidebar */}
        {showCart && (
          <aside className="w-96 bg-gray-800 border-l border-gray-700 p-6 overflow-y-auto max-h-screen">
            <h2 className="text-2xl font-bold mb-4">Votre Panier</h2>

            {cart.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Votre panier est vide</p>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {cart.map(item => (
                    <div key={item.product.id} className="bg-gray-700 rounded-lg p-4 space-y-2">
                      <h3 className="font-semibold">{item.product.name}</h3>
                      <div className="flex items-center justify-between">
                        <p className="text-red-400">${(item.product.price / 100).toFixed(2)}</p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                            className="w-6 h-6 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                          >
                            −
                          </button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                            className="w-6 h-6 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="text-xs text-red-400 hover:text-red-300 w-full text-left"
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}
                </div>

                {/* Cart Summary */}
                <div className="border-t border-gray-700 pt-4 space-y-3">
                  <div className="flex justify-between">
                    <span>Sous-total</span>
                    <span>${(cartTotal / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Frais de service</span>
                    <span>${((cartTotal * 0.1) / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t border-gray-700 pt-3">
                    <span>Total</span>
                    <span>${((cartTotal * 1.1) / 100).toFixed(2)}</span>
                  </div>

                  <button className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-bold transition-colors mt-4">
                    Passer la Commande
                  </button>
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
