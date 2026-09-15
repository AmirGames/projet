'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

import { MapPin, Clock, Star, ShoppingCart, Minus, Plus, ArrowLeft } from 'lucide-react';

import { euro } from '@/lib/format';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  /** Basculé par le commerçant quand le plat n'est plus servi. */
  isAvailable?: boolean;
}

interface Restaurant {
  id: string;
  name: string;
  description: string;
  cuisine: string;
  rating: number;
  deliveryTime: number;
  deliveryFee: number;
  address: string;
  isOpen: boolean;
  products: Product[];
}

interface CartItem extends Product {
  quantity: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function RestaurantDetailPage({ params }: { params: { id: string } }) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    fetchRestaurant();
    loadCart();
  }, [params.id]);

  const fetchRestaurant = async () => {
    try {
      const res = await fetch(`${API_URL}/api/client/stores/${params.id}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) throw new Error('Erreur');
      const data = await res.json();
      const boutique = data.data || data.store || data;

      setRestaurant({
        id: boutique.id,
        name: boutique.name,
        description: boutique.description || '',
        cuisine: boutique.city || '',
        rating: Number(boutique.rating || 0),
        deliveryTime: 30,
        deliveryFee: Number(boutique.deliveryCost || 0),
        address: [boutique.address, boutique.city].filter(Boolean).join(', '),
        isOpen: boutique.isOpen,
        products: (boutique.products || []).map((produit: any) => ({
          id: produit.id,
          name: produit.name,
          description: produit.description || '',
          price: Number(produit.price || 0),
          // Recopier les produits champ par champ laissait cette information
          // au bord de la route : le client voyait les plats épuisés comme
          // les autres et pouvait les commander.
          isAvailable: produit.isAvailable !== false,
        })),
      });
    } catch (err) {
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCart = () => {
    try {
      const savedCart = localStorage.getItem('cart');
      if (savedCart) {
        setCart(JSON.parse(savedCart));
      }
    } catch (err) {
      console.error('Erreur:', err);
    }
  };

  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart);
    localStorage.setItem('cart', JSON.stringify(newCart));
  };

  const addToCart = (product: Product) => {
    // Le bouton est désactivé, mais une page restée ouverte peut avoir une
    // version périmée du menu : on refuse aussi ici.
    if (product.isAvailable === false) return;

    const existingItem = cart.find((item) => item.id === product.id);

    if (existingItem) {
      const updated = cart.map((item) =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      );
      saveCart(updated);
    } else {
      saveCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      saveCart(cart.filter((item) => item.id !== productId));
    } else {
      saveCart(
        cart.map((item) =>
          item.id === productId ? { ...item, quantity } : item
        )
      );
    }
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">Restaurant non trouvé</p>
          <Link href="/restaurants" className="text-green-400 hover:text-green-300">
            Retour à la liste
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header avec info resto */}
      <div className="bg-gradient-to-b from-green-600 to-gray-900 pb-8">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <Link
            href="/restaurants"
            className="inline-flex items-center gap-2 text-green-200 hover:text-white mb-6"
          >
            <ArrowLeft size={20} />
            Retour
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-4xl font-bold mb-2">{restaurant.name}</h1>
              <p className="text-green-100 mb-4">{restaurant.description}</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Star size={18} className="text-yellow-500" />
                  <span>{restaurant.rating.toFixed(1)} / 5</span>
                </div>

                <div className="flex items-center gap-2">
                  <Clock size={18} />
                  <span>{restaurant.deliveryTime} min</span>
                </div>

                <div className="flex items-center gap-2">
                  <MapPin size={18} />
                  <span>{restaurant.address}</span>
                </div>

                <div>
                  <span className="px-3 py-1 bg-green-600 rounded-full text-xs font-medium">
                    {restaurant.cuisine}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Menu */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold mb-6">Menu</h2>

            {restaurant.products && restaurant.products.length > 0 ? (
              <div className="space-y-4">
                {restaurant.products.map((product) => {
                  // Un plat épuisé reste affiché : le masquer laisserait le
                  // client chercher en vain ce qu'il commande d'habitude.
                  const epuise = product.isAvailable === false;

                  return (
                    <div
                      key={product.id}
                      className={`bg-gray-800 rounded-lg p-4 flex items-start justify-between transition ${
                        epuise ? 'opacity-60' : 'hover:bg-gray-750'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-bold text-lg">{product.name}</h3>
                          {epuise && (
                            <span className="px-2 py-0.5 rounded border border-red-500/50 bg-red-500/15 text-red-300 text-xs font-semibold uppercase tracking-wide">
                              Épuisé
                            </span>
                          )}
                        </div>
                        <p className="text-gray-400 text-sm mb-2">{product.description}</p>
                        <p className={`font-bold ${epuise ? 'text-gray-500' : 'text-green-400'}`}>
                          {euro(product.price)}
                        </p>
                      </div>

                      <button
                        onClick={() => addToCart(product)}
                        disabled={epuise}
                        className={`ml-4 p-2 rounded-lg transition ${
                          epuise
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                        title={epuise ? 'Ce plat n\'est plus disponible' : 'Ajouter au panier'}
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400">Aucun produit disponible</p>
            )}
          </div>

          {/* Panier */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-lg p-6 sticky top-6">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingCart size={24} />
                <h3 className="text-xl font-bold">Panier</h3>
                {cartCount > 0 && (
                  <span className="ml-auto bg-green-600 text-white text-sm font-bold px-2 py-1 rounded-full">
                    {cartCount}
                  </span>
                )}
              </div>

              {cart.length === 0 ? (
                <p className="text-gray-400 py-8 text-center">Votre panier est vide</p>
              ) : (
                <>
                  <div className="space-y-3 mb-6 pb-6 border-b border-gray-700">
                    {cart.map((item) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.name}</p>
                          <p className="text-gray-400 text-xs">€{item.price.toFixed(2)}</p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="p-1 hover:bg-gray-700 rounded"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="p-1 hover:bg-gray-700 rounded"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Frais livraison */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Sous-total</span>
                      <span>€{total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Frais livraison</span>
                      <span>€{restaurant.deliveryFee.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t border-gray-700 pt-4 mb-4">
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span className="text-green-400">
                        €{(total + restaurant.deliveryFee).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <Link
                    href="/checkout"
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition block text-center"
                  >
                    Passer la commande
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
