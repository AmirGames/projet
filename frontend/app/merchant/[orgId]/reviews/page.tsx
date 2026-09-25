'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Star, Flag } from 'lucide-react';
import Link from 'next/link';

import { useCurrentStore } from '@/lib/current-store';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Review {
  id: string;
  productId: string | null;
  customerId?: string;
  rating: number;
  comment?: string;
  status: string;
  helpfulCount: number;
  product: { name: string; sku: string } | null;
  customer?: { name: string; email: string };
  createdAt: string;
  /** Où en est l'avis côté modération : c'est la plateforme qui tranche. */
  signalement: 'EN_ATTENTE' | 'CONSERVE' | 'RETIRE' | null;
  motifDecision: string | null;
  peutSignaler: boolean;
}

type Filtre = 'ALL' | 'signales' | 'retires';

export default function ReviewsPage() {
  const t = useTranslations('merchantReviews');
  const { storeId } = useCurrentStore();
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>('ALL');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [compteurs, setCompteurs] = useState({ signales: 0, retires: 0 });
  // L'avis dont le formulaire de signalement est ouvert, et son motif.
  const [aSignaler, setASignaler] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const itemsPerPage = 20;

  useEffect(() => {
    if (storeId) {
      fetchReviews();
    }
  }, [storeId, filtre, page]);

  const jeton = () => localStorage.getItem('accessToken') || localStorage.getItem('token');

  const compter = async (token: string, f: 'signales' | 'retires') => {
    const res = await fetch(`${API_URL}/api/reviews/${storeId}?take=1&filtre=${f}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok ? (await res.json()).total || 0 : 0;
  };

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const token = jeton();
      if (!token) {
        router.push('/login');
        return;
      }

      const skip = page * itemsPerPage;
      const query = new URLSearchParams({
        skip: skip.toString(),
        take: itemsPerPage.toString(),
        ...(filtre !== 'ALL' && { filtre }),
      });

      const response = await fetch(`${API_URL}/api/reviews/${storeId}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch reviews');
      }

      const data = await response.json();
      setReviews(data.data || []);
      setTotal(data.total || 0);

      const [signales, retires] = await Promise.all([compter(token, 'signales'), compter(token, 'retires')]);
      setCompteurs({ signales, retires });
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  // Le commerçant ne rejette ni ne supprime un avis : il le signale, avec un
  // motif, et la plateforme décide de le conserver ou de le retirer.
  const signaler = async (reviewId: string) => {
    setEnvoi(true);
    setErreur('');
    try {
      const response = await fetch(`${API_URL}/api/reviews/${storeId}/${reviewId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton()}` },
        body: JSON.stringify({ reason: motif }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.message);
      }
      setReviews((liste) =>
        liste.map((r) => (r.id === reviewId ? { ...r, signalement: 'EN_ATTENTE', peutSignaler: false } : r))
      );
      setCompteurs((c) => ({ ...c, signales: c.signales + 1 }));
      setASignaler(null);
      setMotif('');
    } catch (error) {
      setErreur(error instanceof Error && error.message ? error.message : t('reportError'));
    } finally {
      setEnvoi(false);
    }
  };

  const totalPages = Math.ceil(total / itemsPerPage);

  if (loading && reviews.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-gray-400">{t('loading')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <Link
              href={`/merchant/${orgId}/dashboard`}
              className="text-gray-400 hover:text-gray-300 text-sm"
            >
              {t('backToDashboard')}
            </Link>
          </div>
          <p className="text-gray-400">{t('description')}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-xs mb-1">{t('total')}</p>
            <p className="text-2xl font-bold">{filtre === 'ALL' ? total : '—'}</p>
          </div>
          <div className="bg-yellow-600/20 border border-yellow-600/50 rounded-lg p-4">
            <p className="text-yellow-400 text-xs mb-1">{t('reportedCount')}</p>
            <p className="text-2xl font-bold text-yellow-400">{compteurs.signales}</p>
          </div>
          <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4">
            <p className="text-red-400 text-xs mb-1">{t('removedCount')}</p>
            <p className="text-2xl font-bold text-red-400">{compteurs.retires}</p>
          </div>
        </div>

        <p className="text-gray-400 text-sm mb-6">{t('moderationNotice')}</p>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(['ALL', 'signales', 'retires'] as const).map(f => (
            <button
              key={f}
              onClick={() => {
                setFiltre(f);
                setPage(0);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filtre === f
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-300 border border-gray-700'
              }`}
            >
              {f === 'ALL' ? t('allReviews') : f === 'signales' ? t('filterReported') : t('filterRemoved')}
            </button>
          ))}
        </div>

        {erreur && (
          <div className="bg-red-900/30 border border-red-700/50 text-red-200 rounded-lg p-3 text-sm mb-4">{erreur}</div>
        )}

        {/* Reviews List */}
        <div className="space-y-4">
          {reviews.length === 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center text-gray-400">
              {t('noReviews')}
            </div>
          ) : (
            reviews.map((review) => (
              <div key={review.id} className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex-1">
                    <p className="text-sm text-gray-400 mb-1">{review.product ? review.product.name : t('storeReview')}</p>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={16}
                            className={i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600'}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-medium text-gray-300">{review.rating}/5</span>
                    </div>
                    {review.customer && (
                      <p className="text-sm text-gray-400">
                        {t('by')} <span className="font-medium">{review.customer.name}</span>
                      </p>
                    )}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${
                    review.status === 'REMOVED'
                      ? 'bg-red-600/20 text-red-400 border-red-600/50'
                      : review.signalement === 'EN_ATTENTE'
                      ? 'bg-yellow-600/20 text-yellow-400 border-yellow-600/50'
                      : 'bg-green-600/20 text-green-400 border-green-600/50'
                  }`}>
                    {review.status === 'REMOVED'
                      ? t('removedStatus')
                      : review.signalement === 'EN_ATTENTE'
                      ? t('reportedStatus')
                      : review.signalement === 'CONSERVE'
                      ? t('keptStatus')
                      : t('publishedStatus')}
                  </span>
                </div>

                {review.comment && (
                  <p className="text-sm text-gray-300 mb-4 italic">"{review.comment}"</p>
                )}

                {review.motifDecision && review.signalement !== 'EN_ATTENTE' && (
                  <p className="text-xs text-gray-400 mb-4">
                    {t('platformNote')} {review.motifDecision}
                  </p>
                )}

                {aSignaler === review.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={motif}
                      onChange={(e) => setMotif(e.target.value)}
                      placeholder={t('reportPlaceholder')}
                      rows={3}
                      className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => signaler(review.id)}
                        disabled={envoi || motif.trim().length < 5}
                        className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium disabled:opacity-50"
                      >
                        {envoi ? '...' : t('sendReport')}
                      </button>
                      <button
                        onClick={() => { setASignaler(null); setMotif(''); }}
                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs font-medium"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                ) : review.peutSignaler && (
                  <button
                    onClick={() => { setASignaler(review.id); setMotif(''); setErreur(''); }}
                    className="px-3 py-2 bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 rounded text-xs font-medium transition-colors"
                  >
                    <Flag size={14} className="inline mr-1" />
                    {t('report')}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 px-6 py-4 bg-gray-800 border border-gray-700 rounded-lg">
            <p className="text-sm text-gray-400">
              {t('pagination', { page: page + 1, total: totalPages })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 disabled:text-gray-600 rounded transition-colors"
              >
                {t('previous')}
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page === totalPages - 1}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 disabled:text-gray-600 rounded transition-colors"
              >
                {t('next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
