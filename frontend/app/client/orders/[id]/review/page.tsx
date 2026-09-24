'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { euro } from '@/lib/format';
import { intituleDeLaLigne, type LigneAffichable } from '@/lib/ligne-commande';
import { useLocale, useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface OrderItem extends LigneAffichable {
  id: string;
  productId: string;
  quantity: number;
  total: number | string;
}

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  storeId?: string;
  deliveryType?: 'DELIVERY' | 'PICKUP';
  items?: OrderItem[];
}

/** Un plat à noter : le serveur n'accepte qu'un avis par plat, pas par ligne. */
interface ProduitANoter {
  productId: string;
  name: string;
  quantity: number;
  total: number;
}

/** Regroupe les lignes d'un même plat (plusieurs déclinaisons, par exemple). */
function produitsANoter(items: OrderItem[]): ProduitANoter[] {
  const parPlat = new Map<string, ProduitANoter>();
  for (const item of items) {
    const deja = parPlat.get(item.productId);
    if (deja) {
      deja.quantity += item.quantity;
      deja.total += Number(item.total) || 0;
    } else {
      parPlat.set(item.productId, {
        productId: item.productId,
        name: intituleDeLaLigne(item).plat,
        quantity: item.quantity,
        total: Number(item.total) || 0,
      });
    }
  }
  return [...parPlat.values()];
}

/** Un avis déjà donné, qui pré-remplit le formulaire. */
interface AvisDonne {
  rating: number;
  comment: string | null;
  donneLe: string;
}

interface AvisDejaDonnes {
  restaurant: AvisDonne | null;
  produits: Record<string, AvisDonne>;
}

interface ReviewState {
  restaurant: { rating: number; comment: string };
  delivery: { rating: number; comment: string };
  products: Record<string, { rating: number; comment: string }>;
}

export default function ReviewPage() {
  const t = useTranslations('clientOrders');
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [produits, setProduits] = useState<ProduitANoter[]>([]);
  // Le livreur ne se note que s'il y en a un, que la course est remise et
  // qu'il ne l'a pas déjà été : une commande à emporter n'en a pas, et la
  // note échouait à chaque fois en 404.
  const [livreurANoter, setLivreurANoter] = useState(false);
  const [dejaDonnes, setDejaDonnes] = useState<AvisDejaDonnes>({ restaurant: null, produits: {} });
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
        // Cette route renvoie la commande directement, pas enveloppée dans
        // « data » : la page lisait une propriété inexistante et affichait
        // toujours « commande introuvable ».
        const data = await response.json();
        const commande: Order = data.data ?? data;
        setOrder(commande);

        const plats = produitsANoter(commande.items ?? []);
        setProduits(plats);

        // Un seul avis par restaurant et par plat, que le client met à jour :
        // le formulaire repart de ce qu'il avait dit.
        let donnes: AvisDejaDonnes = { restaurant: null, produits: {} };
        const avisResponse = await fetch(`${API_URL}/api/reviews/commande/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (avisResponse.ok) {
          donnes = (await avisResponse.json()).data ?? donnes;
          setDejaDonnes(donnes);
        }

        const depuis = (avis?: AvisDonne | null) =>
          avis ? { rating: avis.rating, comment: avis.comment ?? '' } : { rating: 5, comment: '' };

        const initialProducts: Record<string, { rating: number; comment: string }> = {};
        plats.forEach((plat) => {
          initialProducts[plat.productId] = depuis(donnes.produits[plat.productId]);
        });
        setReviews(prev => ({ ...prev, restaurant: depuis(donnes.restaurant), products: initialProducts }));

        if (commande.deliveryType !== 'PICKUP') {
          const courseResponse = await fetch(`${API_URL}/api/client/deliveries/${orderId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (courseResponse.ok) {
            const course = (await courseResponse.json()).data;
            setLivreurANoter(Boolean(course?.driver && course.status === 'DELIVERED' && !course.maNote));
          }
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading order:', err);
      setError(t('errorLoading'));
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

      if (livreurANoter) {
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
      }

      produits.forEach(plat => {
        const productReview = reviews.products[plat.productId];
        if (productReview) {
          requests.push(
            fetch(`${API_URL}/api/reviews`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                orderId,
                productId: plat.productId,
                rating: productReview.rating,
                comment: productReview.comment,
                type: 'PRODUCT'
              })
            })
          );
        }
      });

      const responses = await Promise.all(requests);
      const allOk = responses.every(r => r.ok);

      if (allOk) {
        setSuccess(true);
        setTimeout(() => {
          router.push(`/client/orders/${orderId}`);
        }, 2000);
      } else {
        setError(t('errorPartial'));
      }
    } catch (err) {
      setError(t('errorSubmitting'));
      console.error('Error submitting review:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-white">{t('loading')}</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-900">
        <header className="pt-4">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <Link href="/client/orders" className="flex items-center gap-2 text-orange-500 hover:text-orange-400">
              <ArrowLeft size={20} />
              {t('backToOrder')}
            </Link>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-white">{t('orderNotFound')}</p>
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

  // « Vous aviez mis 4★ en mars. Toujours d'accord ? » — l'année n'est
  // précisée que si ce n'est pas l'année en cours.
  const renderAvisPrecedent = (avis?: AvisDonne | null) => {
    if (!avis) return null;
    const date = new Date(avis.donneLe);
    const dateAvis = date.toLocaleDateString(locale, {
      month: 'long',
      ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
    });
    return (
      <p className="text-orange-300 text-sm mb-3">
        {t('previousReview', { note: avis.rating, date: dateAvis })}
      </p>
    );
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
      <header className="pt-4">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <Link href={`/client/orders/${orderId}`} className="flex items-center gap-2 text-orange-500 hover:text-orange-400">
            <ArrowLeft size={20} />
            {t('backToOrder')}
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-gray-800 rounded-lg p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{t('reviewTitle')}</h1>
              <p className="text-gray-400">{t('reviewSubtitle')}</p>
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
              ⚡ {expressMode ? t('expressMode') : t('detailedMode')}
            </button>
          </div>

          {success ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✓</div>
              <p className="text-white text-xl font-semibold mb-2">{t('thankYou')}</p>
              <p className="text-gray-400">{t('redirecting')}</p>
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
                  {t('restaurantTab')}
                </button>
                {livreurANoter && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('delivery')}
                    className={`px-4 py-3 font-semibold transition ${
                      activeTab === 'delivery'
                        ? 'text-orange-500 border-b-2 border-orange-500'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('deliveryTab')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('products')}
                  className={`px-4 py-3 font-semibold transition ${
                    activeTab === 'products'
                      ? 'text-orange-500 border-b-2 border-orange-500'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {t('productsTab')}
                </button>
              </div>

              {/* Restaurant Tab */}
              {activeTab === 'restaurant' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-white font-semibold mb-4">{t('restaurantQuestion')}</label>
                    {renderAvisPrecedent(dejaDonnes.restaurant)}
                    {renderStars(reviews.restaurant.rating, (r) =>
                      setReviews(prev => ({ ...prev, restaurant: { ...prev.restaurant, rating: r } }))
                    )}
                    <p className="text-gray-400 text-sm mt-2">{getRatingText(reviews.restaurant.rating)}</p>
                  </div>

                  {!expressMode && (
                    <div>
                      <label className="block text-white font-semibold mb-4">{t('commentOptional')}</label>
                      <textarea
                        value={reviews.restaurant.comment}
                        onChange={(e) => setReviews(prev => ({
                          ...prev,
                          restaurant: { ...prev.restaurant, comment: e.target.value }
                        }))}
                        placeholder={t('restaurantPlaceholder')}
                        rows={4}
                        className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Delivery Tab */}
              {activeTab === 'delivery' && livreurANoter && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-white font-semibold mb-4">{t('deliveryQuestion')}</label>
                    {renderStars(reviews.delivery.rating, (r) =>
                      setReviews(prev => ({ ...prev, delivery: { ...prev.delivery, rating: r } }))
                    )}
                    <p className="text-gray-400 text-sm mt-2">{getRatingText(reviews.delivery.rating)}</p>
                  </div>

                  {!expressMode && (
                    <div>
                      <label className="block text-white font-semibold mb-4">{t('commentOptional')}</label>
                      <textarea
                        value={reviews.delivery.comment}
                        onChange={(e) => setReviews(prev => ({
                          ...prev,
                          delivery: { ...prev.delivery, comment: e.target.value }
                        }))}
                        placeholder={t('deliveryPlaceholder')}
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
                  {produits.length > 0 ? (
                    produits.map((item) => (
                      <div key={item.productId} className="bg-gray-700 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="text-white font-semibold">{item.name}</p>
                            <p className="text-gray-400 text-sm">x{item.quantity} • {euro(item.total)}</p>
                          </div>
                        </div>

                        <div className="mb-3">
                          {renderAvisPrecedent(dejaDonnes.produits[item.productId])}
                          {renderStars(reviews.products[item.productId]?.rating || 5, (r) =>
                            setReviews(prev => ({
                              ...prev,
                              products: {
                                ...prev.products,
                                [item.productId]: { ...prev.products[item.productId], rating: r }
                              }
                            }))
                          )}
                          <p className="text-gray-400 text-sm mt-2">{getRatingText(reviews.products[item.productId]?.rating || 5)}</p>
                        </div>

                        {!expressMode && (
                          <textarea
                            value={reviews.products[item.productId]?.comment || ''}
                            onChange={(e) => setReviews(prev => ({
                              ...prev,
                              products: {
                                ...prev.products,
                                [item.productId]: { ...prev.products[item.productId], comment: e.target.value }
                              }
                            }))}
                            placeholder={t('productPlaceholder')}
                            rows={3}
                            className="w-full px-4 py-3 bg-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500 text-sm"
                          />
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-400">{t('noProducts')}</p>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg transition"
              >
                {submitting ? t('submitting') : expressMode ? t('submitExpress') : t('submitReview')}
              </button>

              <p className="text-gray-400 text-xs text-center">
                {expressMode ? t('expressMessage') : t('detailedMessage')}
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
