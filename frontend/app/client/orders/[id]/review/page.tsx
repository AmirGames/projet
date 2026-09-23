'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  storeId?: string;
  storeName?: string;
  items?: OrderItem[];
}

interface ReviewState {
  restaurant: { rating: number; comment: string };
  delivery: { rating: number; comment: string };
  products: Record<string, { rating: number; comment: string }>;
}

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'restaurant' | 'delivery' | 'products'>('restaurant');
  const [expressMode, setExpressMode] = useState(false);

  const [reviews, setReviews] = useState<ReviewState>({
    restaurant: { rating: 5, comment: '' },
    delivery: { rating: 5, comment: '' },
    products: {}
  });

  useEffect(() => {
    loadOrderData();
  }, [orderId]);

  const loadOrderData = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setOrder(data.data);

        const initialProducts: Record<string, { rating: number; comment: string }> = {};
        if (data.data.items) {
          data.data.items.forEach((item: OrderItem) => {
            initialProducts[item.id] = { rating: 5, comment: '' };
          });
        }
        setReviews(prev => ({ ...prev, products: initialProducts }));
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading order:', err);
      setError('Erreur lors du chargement de la commande');
      setLoading(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();

    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const requests = [];

      requests.push(
        fetch(`${API_URL}/api/reviews`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            orderId,
            rating: reviews.restaurant.rating,
            comment: reviews.restaurant.comment,
            type: 'STORE'
          })
        })
      );

      requests.push(
        fetch(`${API_URL}/api/client/deliveries/${orderId}/rating`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            note: reviews.delivery.rating,
            commentaire: reviews.delivery.comment
          })
        })
      );

      if (order?.items) {
        order.items.forEach(item => {
          const productReview = reviews.products[item.id];
          if (productReview) {
            requests.push(
              fetch(`${API_URL}/api/reviews`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  productId: item.id,
                  rating: productReview.rating,
                  comment: productReview.comment,
                  type: 'PRODUCT'
                })
              })
            );
          }
        });
      }

      const responses = await Promise.all(requests);
      const allOk = responses.every(r => r.ok);

      if (allOk) {
        setSuccess(true);
        setTimeout(() => {
          router.push(`/client/orders/${orderId}`);
        }, 2000);
      } else {
        setError('Erreur lors de la soumission de certains avis');
      }
    } catch (err) {
      setError("Erreur lors de la soumission de l\'avis");
      console.error('Error submitting review:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-white">Chargement...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-900">
        <header className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <Link href="/client/orders" className="flex items-center gap-2 text-orange-500 hover:text-orange-400">
              <ArrowLeft size={20} />
              Retour
            </Link>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-white">Commande non trouvée</p>
        </div>
      </div>
    );
  }

  const getRatingText = (rating: number) => {
    const texts: Record<number, string> = {
      1: 'Mauvais',
      2: 'Acceptable',
      3: 'Moyen',
      4: 'Bon',
      5: 'Excellent'
    };
    return texts[rating] || '';
  };

  const renderStars = (rating: number, onRate: (r: number) => void) => (
    <div className="flex gap-3 text-4xl">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onRate(star)}
          className={`transition transform hover:scale-110 cursor-pointer ${
            star <= rating ? 'text-yellow-400' : 'text-gray-700'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <Link href={`/client/orders/${orderId}`} className="flex items-center gap-2 text-orange-500 hover:text-orange-400">
            <ArrowLeft size={20} />
            Retour à la commande
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-gray-800 rounded-lg p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Évaluer votre commande</h1>
              <p className="text-gray-400">Notez le restaurant, le livreur et les produits</p>
            </div>
            <button
              type="button"
              onClick={() => setExpressMode(!expressMode)}
              className={`px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap ml-4 ${
                expressMode
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              ⚡ {expressMode ? 'Mode Rapide' : 'Mode Détaillé'}
            </button>
          </div>

          {success ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✓</div>
              <p className="text-white text-xl font-semibold mb-2">Merci pour votre avis !</p>
              <p className="text-gray-400">Vous allez être redirigé...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmitReview} className="space-y-8">
              {error && (
                <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-red-200">
                  {error}
                </div>
              )}

              {/* Tabs */}
              <div className="flex gap-2 border-b border-gray-700">
                <button
                  type="button"
                  onClick={() => setActiveTab('restaurant')}
                  className={`px-4 py-3 font-semibold transition ${
                    activeTab === 'restaurant'
                      ? 'text-orange-500 border-b-2 border-orange-500'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🍽️ Restaurant
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('delivery')}
                  className={`px-4 py-3 font-semibold transition ${
                    activeTab === 'delivery'
                      ? 'text-orange-500 border-b-2 border-orange-500'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🚗 Livreur
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('products')}
                  className={`px-4 py-3 font-semibold transition ${
                    activeTab === 'products'
                      ? 'text-orange-500 border-b-2 border-orange-500'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  📦 Produits
                </button>
              </div>

              {/* Restaurant Tab */}
              {activeTab === 'restaurant' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-white font-semibold mb-4">Comment avez-vous trouvé le restaurant ?</label>
                    {renderStars(reviews.restaurant.rating, (r) =>
                      setReviews(prev => ({ ...prev, restaurant: { ...prev.restaurant, rating: r } }))
                    )}
                    <p className="text-gray-400 text-sm mt-2">{getRatingText(reviews.restaurant.rating)}</p>
                  </div>

                  {!expressMode && (
                    <div>
                      <label className="block text-white font-semibold mb-4">Commentaire (optionnel)</label>
                      <textarea
                        value={reviews.restaurant.comment}
                        onChange={(e) => setReviews(prev => ({
                          ...prev,
                          restaurant: { ...prev.restaurant, comment: e.target.value }
                        }))}
                        placeholder="Qualité du repas, présentation, température..."
                        rows={4}
                        className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Delivery Tab */}
              {activeTab === 'delivery' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-white font-semibold mb-4">Comment s'est passée la livraison ?</label>
                    {renderStars(reviews.delivery.rating, (r) =>
                      setReviews(prev => ({ ...prev, delivery: { ...prev.delivery, rating: r } }))
                    )}
                    <p className="text-gray-400 text-sm mt-2">{getRatingText(reviews.delivery.rating)}</p>
                  </div>

                  {!expressMode && (
                    <div>
                      <label className="block text-white font-semibold mb-4">Commentaire (optionnel)</label>
                      <textarea
                        value={reviews.delivery.comment}
                        onChange={(e) => setReviews(prev => ({
                          ...prev,
                          delivery: { ...prev.delivery, comment: e.target.value }
                        }))}
                        placeholder="Rapidité, politesse du livreur, état du colis..."
                        rows={4}
                        className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Products Tab */}
              {activeTab === 'products' && (
                <div className="space-y-6">
                  {order.items && order.items.length > 0 ? (
                    order.items.map((item) => (
                      <div key={item.id} className="bg-gray-700 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="text-white font-semibold">{item.name}</p>
                            <p className="text-gray-400 text-sm">x{item.quantity} • {euro(item.price * item.quantity)}</p>
                          </div>
                        </div>

                        <div className="mb-3">
                          {renderStars(reviews.products[item.id]?.rating || 5, (r) =>
                            setReviews(prev => ({
                              ...prev,
                              products: {
                                ...prev.products,
                                [item.id]: { ...prev.products[item.id], rating: r }
                              }
                            }))
                          )}
                          <p className="text-gray-400 text-sm mt-2">{getRatingText(reviews.products[item.id]?.rating || 5)}</p>
                        </div>

                        {!expressMode && (
                          <textarea
                            value={reviews.products[item.id]?.comment || ''}
                            onChange={(e) => setReviews(prev => ({
                              ...prev,
                              products: {
                                ...prev.products,
                                [item.id]: { ...prev.products[item.id], comment: e.target.value }
                              }
                            }))}
                            placeholder="Goût, fraîcheur, portion..."
                            rows={3}
                            className="w-full px-4 py-3 bg-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500 text-sm"
                          />
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-400">Aucun produit à évaluer</p>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg transition"
              >
                {submitting ? 'Envoi en cours...' : expressMode ? '⚡ Soumettre rapidement' : 'Soumettre tous les avis'}
              </button>

              <p className="text-gray-400 text-xs text-center">
                {expressMode ? '⚡ Mode rapide : 30 secondes pour noter' : 'Vos avis nous aident à améliorer notre service'}
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
