'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Star, Clock, MapPin, Heart, Plus, Minus, ShoppingCart } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  category?: { id: string; name: string };
  rating?: number;
  variants?: any[];
}

interface Store {
  id: string;
  name: string;
  description?: string;
  address?: string;
  city?: string;
  rating?: number;
  totalRatings?: number;
  distance?: number;
  deliveryCost?: number;
  minDeliveryAmount?: number;
  latitude?: number;
  longitude?: number;
}

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  storeId: string;
}

export default function RestaurantDetail() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.id as string;

  const [store, setStore] = useState<Store | null>(null);
  const [menu, setMenu] = useState<Record<string, Product[]>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    loadRestaurantData();
  }, [storeId]);

  const loadRestaurantData = async () => {
    try {
      setLoading(true);

      // Get store details
      const storeResponse = await fetch(`${API_URL}/api/client/stores/${storeId}`);
      if (!storeResponse.ok) throw new Error('Restaurant not found');
      const storeData = await storeResponse.json();
      setStore(storeData.data);
      setMenu(storeData.data.menu || {});

      // Set first category as selected
      const categories = Object.keys(storeData.data.menu || {});
      if (categories.length > 0) {
        setSelectedCategory(categories[0]);
      }

      // Check if favorite
      const token = localStorage.getItem('accessToken');
      if (token) {
        const favResponse = await fetch(`${API_URL}/api/client/me/favorites`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (favResponse.ok) {
          const favData = await favResponse.json();
          setIsFavorite(favData.data.some((fav: any) => fav.storeId === storeId));
        }
      }
    } catch (err) {
      console.error('Error loading restaurant:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      if (isFavorite) {
        await fetch(`${API_URL}/api/client/me/favorites/${storeId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await fetch(`${API_URL}/api/client/me/favorites`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ storeId })
        });
      }
      setIsFavorite(!isFavorite);
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  };

  const addToCart = (product: Product, quantity: number = 1) => {
    const existingItem = cart.find(item => item.productId === product.id);

    if (existingItem) {
      setCart(
        cart.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity,
          storeId
        }
      ]);
    }

    setShowProductModal(false);
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(
        cart.map(item =>
          item.productId === productId ? { ...item, quantity } : item
        )
      );
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = store?.deliveryCost || 0;
  const total = cartTotal + deliveryFee;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-white text-lg">Chargement du restaurant...</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg mb-4">Restaurant non trouvé</p>
          <Link href="/client" className="text-orange-500 hover:text-orange-400">
            Retour à la recherche →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 sticky top-0 z-40 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/client" className="flex items-center gap-2 text-orange-500 hover:text-orange-400">
            <ArrowLeft size={20} />
            Retour
          </Link>
          <div className="text-white font-bold text-lg">{store.name}</div>
          <div className="text-right">
            <p className="text-white font-bold text-2xl">{cart.length}</p>
            <p className="text-gray-400 text-sm">Articles</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Menu Section */}
          <div className="lg:col-span-2">
            {/* Restaurant Info */}
            <div className="bg-gray-800 rounded-lg p-6 mb-8">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h1 className="text-3xl font-bold text-white mb-2">{store.name}</h1>
                  <p className="text-gray-400">{store.description}</p>
                </div>
                <button
                  onClick={toggleFavorite}
                  className={`p-2 rounded-full ${
                    isFavorite
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-700 text-gray-400 hover:text-red-500'
                  }`}
                >
                  <Heart size={24} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Star size={16} className="text-yellow-500 fill-yellow-500" />
                  <span className="text-white">{store.rating || 4.5}</span>
                  <span className="text-gray-500">({store.totalRatings || 0})</span>
                </div>
                {store.address && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <MapPin size={16} />
                    <span>{store.address}</span>
                  </div>
                )}
                {store.distance && (
                  <div className="text-gray-400">📍 {store.distance} km</div>
                )}
                {store.deliveryCost !== undefined && (
                  <div className="text-gray-400">
                    Livraison: €{(store.deliveryCost / 100).toFixed(2)}
                  </div>
                )}
              </div>
            </div>

            {/* Categories & Menu */}
            <div className="mb-8">
              {/* Category Tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {Object.keys(menu).map(category => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-4 py-2 rounded-lg whitespace-nowrap transition ${
                      selectedCategory === category
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>

              {/* Products */}
              <div className="space-y-3">
                {menu[selectedCategory]?.map(product => (
                  <div
                    key={product.id}
                    onClick={() => {
                      setSelectedProduct(product);
                      setShowProductModal(true);
                    }}
                    className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 cursor-pointer transition flex justify-between items-start"
                  >
                    <div className="flex-1">
                      <h3 className="text-white font-semibold">{product.name}</h3>
                      <p className="text-gray-400 text-sm mt-1">{product.description}</p>
                      <p className="text-orange-500 font-bold mt-2">
                        €{(product.price / 100).toFixed(2)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(product, 1);
                      }}
                      className="ml-4 bg-orange-600 hover:bg-orange-700 text-white p-2 rounded-lg"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cart Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-lg p-6 sticky top-24">
              <h2 className="text-xl font-bold text-white mb-4">Panier</h2>

              {cart.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Panier vide</p>
              ) : (
                <>
                  <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
                    {cart.map(item => (
                      <div key={item.productId} className="bg-gray-700 rounded p-3">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-white font-semibold flex-1">{item.name}</p>
                          <button
                            onClick={() => removeFromCart(item.productId)}
                            className="text-red-500 hover:text-red-400 text-sm"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}
                              className="bg-gray-600 hover:bg-gray-500 text-white p-1 rounded"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="text-white font-semibold w-6 text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateCartQuantity(item.productId, item.quantity + 1)}
                              className="bg-gray-600 hover:bg-gray-500 text-white p-1 rounded"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <span className="text-orange-400 font-semibold">
                            €{((item.price * item.quantity) / 100).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="border-t border-gray-600 pt-4 space-y-2">
                    <div className="flex justify-between text-gray-400">
                      <span>Sous-total</span>
                      <span>€{(cartTotal / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Livraison</span>
                      <span>€{(deliveryFee / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-white font-bold text-lg pt-2 border-t border-gray-600">
                      <span>Total</span>
                      <span className="text-orange-500">€{(total / 100).toFixed(2)}</span>
                    </div>

                    {store.minDeliveryAmount && cartTotal < store.minDeliveryAmount && (
                      <p className="text-red-400 text-sm mt-3">
                        Minimum de commande: €{(store.minDeliveryAmount / 100).toFixed(2)}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => router.push('/client/checkout')}
                    disabled={
                      cart.length === 0 ||
                      (store.minDeliveryAmount && cartTotal < store.minDeliveryAmount)
                    }
                    className="w-full mt-6 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2"
                  >
                    <ShoppingCart size={20} />
                    Passer la commande
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Product Modal */}
      {showProductModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-gray-800 w-full rounded-t-lg p-6 max-h-96 overflow-y-auto">
            <h2 className="text-2xl font-bold text-white mb-2">{selectedProduct.name}</h2>
            <p className="text-gray-400 mb-4">{selectedProduct.description}</p>
            <p className="text-3xl font-bold text-orange-500 mb-6">
              €{(selectedProduct.price / 100).toFixed(2)}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowProductModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg"
              >
                Annuler
              </button>
              <button
                onClick={() => addToCart(selectedProduct, 1)}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg"
              >
                Ajouter au panier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
