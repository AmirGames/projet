'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Star } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  storeId?: string;
  storeName?: string;
  items?: any[];
}

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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
      const response = await fetch(`${API_URL}/api/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          orderId,
          rating,
          comment,
          type: 'ORDER'
        })
      });

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push(`/client/orders/${orderId}`);
        }, 2000);
      } else {
        const data = await response.json();
        setError(data.message || 'Erreur lors de la soumission de l\'avis');
      }
    } catch (err) {
      setError('Erreur lors de la soumission de l\'avis');
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

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
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
          <h1 className="text-3xl font-bold text-white mb-2">Évaluer votre commande</h1>
          <p className="text-gray-400 mb-8">Aidez-nous à améliorer notre service en partageant votre avis</p>

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

              {/* Star Rating */}
              <div>
                <label className="block text-white font-semibold mb-4">Note globale</label>
                <div className="flex gap-3 text-4xl">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={`transition transform hover:scale-110 ${
                        star <= rating ? 'text-yellow-400' : 'text-gray-700'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <p className="text-gray-400 text-sm mt-2">
                  {rating === 1 && 'Mauvais'}
                  {rating === 2 && 'Acceptable'}
                  {rating === 3 && 'Moyen'}
                  {rating === 4 && 'Bon'}
                  {rating === 5 && 'Excellent'}
                </p>
              </div>

              {/* Comment */}
              <div>
                <label className="block text-white font-semibold mb-4">Votre avis (optionnel)</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Partagez plus de détails sur votre expérience..."
                  rows={5}
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500"
                />
              </div>

              {/* Items Breakdown */}
              {order.items && order.items.length > 0 && (
                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-white font-semibold mb-3">Articles commandés:</p>
                  <div className="space-y-2 text-sm text-gray-300">
                    {order.items.map((item: any) => (
                      <div key={item.id} className="flex justify-between">
                        <span>{item.name} x{item.quantity}</span>
                        <span>€{((item.price * item.quantity) / 100).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg transition"
              >
                {submitting ? 'Envoi en cours...' : 'Soumettre mon avis'}
              </button>

              <p className="text-gray-400 text-xs text-center">
                Votre avis nous aide à améliorer notre service pour tous nos clients
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
