'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, Plus, Minus } from 'lucide-react';
import { useCart } from '@/lib/cart-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, getCartTotal, getDeliveryFee, getTotalWithDelivery, removeFromCart, updateQuantity } = useCart();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');

  useEffect(() => {
    loadCustomerInfo();
  }, []);

  const loadCustomerInfo = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/customers/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setCustomer(data.data);
        setDeliveryAddress(data.data.address || '');
        setPhone(data.data.phone || '');
      }
    } catch (err) {
      console.error('Error loading customer info:', err);
    }
  };

  const handlePlaceOrder = async () => {
    if (!deliveryAddress.trim()) {
      setError('Adresse de livraison requise');
      return;
    }

    if (!phone.trim()) {
      setError('Numéro de téléphone requis');
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Group items by store for multiple orders
      const ordersByStore = cart.map(store => ({
        storeId: store.storeId,
        items: store.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price
        })),
        deliveryAddress,
        phone,
        notes,
        paymentStatus: paymentMethod === 'cash' ? 'PENDING' : 'PROCESSING'
      }));

      // For multi-restaurant order, we create one parent order
      const orderResponse = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          orders: ordersByStore,
          totalAmount: getTotalWithDelivery(),
          deliveryAddress,
          phone,
          notes,
          paymentMethod
        })
      });

      if (!orderResponse.ok) {
        const error = await orderResponse.json();
        throw new Error(error.message || 'Failed to create order');
      }

      const orderData = await orderResponse.json();
      const orderId = orderData.data.id;

      // If card payment, redirect to payment
      if (paymentMethod === 'card') {
        // Create payment session with Stripe
        const paymentResponse = await fetch(`${API_URL}/api/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            orderId,
            amount: getTotalWithDelivery(),
            method: 'card'
          })
        });

        if (!paymentResponse.ok) {
          throw new Error('Payment initialization failed');
        }

        const paymentData = await paymentResponse.json();
        // Redirect to Stripe or payment page
        if (paymentData.data.checkoutUrl) {
          router.push(paymentData.data.checkoutUrl);
        } else {
          router.push(`/client/orders/${orderId}`);
        }
      } else {
        // Cash payment - show order confirmation
        router.push(`/client/orders/${orderId}`);
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900">
        <header className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <Link href="/client" className="flex items-center gap-2 text-orange-500 hover:text-orange-400">
              <ArrowLeft size={20} />
              Retour
            </Link>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <p className="text-white text-2xl mb-4">Panier vide</p>
          <Link href="/client" className="text-orange-500 hover:text-orange-400">
            Continuer les achats →
          </Link>
        </div>
      </div>
    );
  }

  const cartTotal = getCartTotal();
  const deliveryFee = getDeliveryFee();
  const total = getTotalWithDelivery();

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link href="/client" className="flex items-center gap-2 text-orange-500 hover:text-orange-400">
            <ArrowLeft size={20} />
            Retour aux restaurants
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">Finaliser la commande</h1>

        {error && (
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-6 text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Order Summary */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Récapitulatif de commande</h2>

              <div className="space-y-6">
                {cart.map(store => (
                  <div key={store.storeId}>
                    <h3 className="text-lg font-semibold text-orange-500 mb-3">{store.storeName}</h3>

                    <div className="space-y-2 mb-4">
                      {store.items.map(item => (
                        <div key={item.productId} className="flex justify-between items-center bg-gray-700 p-3 rounded">
                          <div className="flex-1">
                            <p className="text-white font-semibold">{item.name}</p>
                            <p className="text-gray-400 text-sm">
                              €{(item.price / 100).toFixed(2)} x {item.quantity}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 bg-gray-600 rounded px-2 py-1">
                              <button
                                onClick={() => updateQuantity(store.storeId, item.productId, item.quantity - 1)}
                                className="text-white hover:text-orange-400"
                              >
                                <Minus size={14} />
                              </button>
                              <span className="text-white font-semibold w-6 text-center">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => updateQuantity(store.storeId, item.productId, item.quantity + 1)}
                                className="text-white hover:text-orange-400"
                              >
                                <Plus size={14} />
                              </button>
                            </div>

                            <span className="text-orange-400 font-bold min-w-20 text-right">
                              €{((item.price * item.quantity) / 100).toFixed(2)}
                            </span>

                            <button
                              onClick={() => removeFromCart(store.storeId, item.productId)}
                              className="text-red-500 hover:text-red-400 p-1"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Delivery Information */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Informations de livraison</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-semibold mb-2">
                    Adresse de livraison *
                  </label>
                  <input
                    type="text"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Votre adresse complète"
                    className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-semibold mb-2">
                    Numéro de téléphone *
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Votre numéro de téléphone"
                    className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-semibold mb-2">
                    Notes spéciales (optionnel)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Instructions spéciales pour le livreur..."
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Méthode de paiement</h2>

              <div className="space-y-3">
                <label className="flex items-center p-4 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600">
                  <input
                    type="radio"
                    name="payment"
                    value="card"
                    checked={paymentMethod === 'card'}
                    onChange={(e) => setPaymentMethod(e.target.value as 'card' | 'cash')}
                    className="mr-3"
                  />
                  <div>
                    <p className="text-white font-semibold">Carte bancaire</p>
                    <p className="text-gray-400 text-sm">Visa, Mastercard</p>
                  </div>
                </label>

                <label className="flex items-center p-4 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600">
                  <input
                    type="radio"
                    name="payment"
                    value="cash"
                    checked={paymentMethod === 'cash'}
                    onChange={(e) => setPaymentMethod(e.target.value as 'card' | 'cash')}
                    className="mr-3"
                  />
                  <div>
                    <p className="text-white font-semibold">À la livraison</p>
                    <p className="text-gray-400 text-sm">Paiement en espèces</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-lg p-6 sticky top-8">
              <h2 className="text-xl font-bold text-white mb-6">Résumé</h2>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-400">
                  <span>Articles</span>
                  <span>€{(cartTotal / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Frais de livraison</span>
                  <span>€{(deliveryFee / 100).toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t border-gray-600 pt-4 mb-6">
                <div className="flex justify-between text-white text-xl font-bold">
                  <span>Total</span>
                  <span className="text-orange-500">€{(total / 100).toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={handlePlaceOrder}
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg transition"
              >
                {loading ? 'Traitement...' : 'Commander'}
              </button>

              <p className="text-gray-400 text-xs text-center mt-4">
                En passant cette commande, vous acceptez nos conditions générales
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
