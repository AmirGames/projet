'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Star, Trash2, CheckCircle } from 'lucide-react';
import Link from 'next/link';

import { useCurrentStore } from '@/lib/current-store';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Review {
  id: string;
  productId: string;
  customerId?: string;
  rating: number;
  comment?: string;
  status: string;
  helpfulCount: number;
  product: { name: string; sku: string } | null;
  customer?: { name: string; email: string };
  createdAt: string;
}

export default function ReviewsPage() {
  const t = useTranslations('merchantReviews');
  const { storeId } = useCurrentStore();
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('ALL');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [updating, setUpdating] = useState<string | null>(null);

  const itemsPerPage = 20;

  useEffect(() => {
    if (storeId) {
      fetchReviews();
    }
  }, [storeId, status, page]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      const skip = page * itemsPerPage;
      const query = new URLSearchParams({
        skip: skip.toString(),
        take: itemsPerPage.toString(),
        ...(status !== 'ALL' && { status }),
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
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveReview = async (reviewId: string) => {
    try {
      setUpdating(reviewId);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/reviews/${storeId}/${reviewId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'APPROVED' }),
      });

      if (!response.ok) {
        throw new Error('Failed to approve review');
      }

      const data = await response.json();
      setReviews(reviews.map(r => r.id === reviewId ? data.review : r));
    } catch (error) {
      console.error('Error approving review:', error);
    } finally {
      setUpdating(null);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    try {
      setUpdating(reviewId);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/reviews/${storeId}/${reviewId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to delete review');
      }

      setReviews(reviews.filter(r => r.id !== reviewId));
    } catch (error) {
      console.error('Error deleting review:', error);
    } finally {
      setUpdating(null);
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-xs mb-1">{t('total')}</p>
            <p className="text-2xl font-bold">{total}</p>
          </div>
          <div className="bg-yellow-600/20 border border-yellow-600/50 rounded-lg p-4">
            <p className="text-yellow-400 text-xs mb-1">{t('pending')}</p>
            <p className="text-2xl font-bold text-yellow-400">{reviews.filter(r => r.status === 'PENDING').length}</p>
          </div>
          <div className="bg-green-600/20 border border-green-600/50 rounded-lg p-4">
            <p className="text-green-400 text-xs mb-1">{t('approved')}</p>
            <p className="text-2xl font-bold text-green-400">{reviews.filter(r => r.status === 'APPROVED').length}</p>
          </div>
          <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4">
            <p className="text-red-400 text-xs mb-1">{t('rejected')}</p>
            <p className="text-2xl font-bold text-red-400">{reviews.filter(r => r.status === 'REJECTED').length}</p>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(s => {
            const labelKey = s === 'ALL' ? 'allReviews' : s.toLowerCase();
            return (
              <button
                key={s}
                onClick={() => {
                  setStatus(s);
                  setPage(0);
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  status === s
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-300 border border-gray-700'
                }`}
              >
                {t(labelKey)}
              </button>
            );
          })}
        </div>

        {/* Reviews List */}
        <div className="space-y-4">
          {reviews.length === 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center text-gray-400">
              {t('noReviews')}
            </div>
          ) : (
            reviews.map((review) => (
              <div key={review.id} className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
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
                        Par <span className="font-medium">{review.customer.name}</span> ({review.customer.email})
                      </p>
                    )}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    review.status === 'APPROVED'
                      ? 'bg-green-600/20 text-green-400 border-green-600/50'
                      : review.status === 'REJECTED'
                      ? 'bg-red-600/20 text-red-400 border-red-600/50'
                      : 'bg-yellow-600/20 text-yellow-400 border-yellow-600/50'
                  }`}>
                    {review.status === 'APPROVED' && t('approved_status')}
                    {review.status === 'REJECTED' && t('rejected_status')}
                    {review.status === 'PENDING' && t('pending_status')}
                  </span>
                </div>

                {review.comment && (
                  <p className="text-sm text-gray-300 mb-4 italic">"{review.comment}"</p>
                )}

                <div className="flex gap-2">
                  {review.status === 'PENDING' && (
                    <button
                      onClick={() => handleApproveReview(review.id)}
                      disabled={updating === review.id}
                      className="px-3 py-2 bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {updating === review.id ? '...' : <CheckCircle size={14} className="inline mr-1" />}
                      {t('approve')}
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteReview(review.id)}
                    disabled={updating === review.id}
                    className="px-3 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {updating === review.id ? '...' : <Trash2 size={14} className="inline mr-1" />}
                    {t('delete')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 px-6 py-4 bg-gray-800 border border-gray-700 rounded-lg">
            <p className="text-sm text-gray-400">
              {t('pagination').replace('{page}', (page + 1).toString()).replace('{total}', totalPages.toString())}
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
