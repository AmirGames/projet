'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Clock, CheckCircle, AlertCircle, Package, Eye } from 'lucide-react';
import Link from 'next/link';

import { useCurrentStore } from '@/lib/current-store';

import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  product: {
    name: string;
    sku: string;
  };
}

interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  deliveryType: string;
  items: OrderItem[];
  createdAt: string;
}

type OrderStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'READY' | 'COMPLETED';

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/50',
  ACCEPTED: 'bg-blue-600/20 text-blue-400 border-blue-600/50',
  READY: 'bg-green-600/20 text-green-400 border-green-600/50',
  COMPLETED: 'bg-purple-600/20 text-purple-400 border-purple-600/50',
  REJECTED: 'bg-red-600/20 text-red-400 border-red-600/50',
};

const statusIcons: Record<string, any> = {
  PENDING: Clock,
  ACCEPTED: CheckCircle,
  READY: Package,
  COMPLETED: CheckCircle,
  REJECTED: AlertCircle,
};

export default function OrdersPage() {
  const t = useTranslations('merchantOrders');
  const { storeId } = useCurrentStore();
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const itemsPerPage = 20;

  useEffect(() => {
    if (storeId) {
      fetchOrders();
      fetchStats();
    }
  }, [storeId, filter, page]);

  const fetchOrders = async () => {
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
        ...(filter !== 'ALL' && { status: filter }),
      });

      const response = await fetch(`${API_URL}/api/order-management/${storeId}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }

      const data = await response.json();
      setOrders(data.data || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/order-management/${storeId}/stats/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      setUpdating(orderId);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/order-management/${storeId}/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update order status');
      }

      const data = await response.json();
      setOrders(orders.map(o => o.id === orderId ? data.order : o));
      fetchStats();
    } catch (error) {
      console.error('Error updating order status:', error);
    } finally {
      setUpdating(null);
    }
  };

  const totalPages = Math.ceil(total / itemsPerPage);

  if (loading && orders.length === 0) {
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
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-gray-400 text-xs mb-1">{t('statsTotal')}</p>
              <p className="text-2xl font-bold">{stats.totalOrders}</p>
            </div>
            <div className="bg-yellow-600/20 border border-yellow-600/50 rounded-lg p-4">
              <p className="text-yellow-400 text-xs mb-1">{t('statsPending')}</p>
              <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
            </div>
            <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-4">
              <p className="text-blue-400 text-xs mb-1">{t('statsAccepted')}</p>
              <p className="text-2xl font-bold text-blue-400">{stats.accepted}</p>
            </div>
            <div className="bg-green-600/20 border border-green-600/50 rounded-lg p-4">
              <p className="text-green-400 text-xs mb-1">{t('statsReady')}</p>
              <p className="text-2xl font-bold text-green-400">{stats.ready}</p>
            </div>
            <div className="bg-purple-600/20 border border-purple-600/50 rounded-lg p-4">
              <p className="text-purple-400 text-xs mb-1">{t('statsCompleted')}</p>
              <p className="text-2xl font-bold text-purple-400">{stats.completed}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-gray-400 text-xs mb-1">{t('statsRevenue')}</p>
              <p className="text-2xl font-bold">{euro(stats.totalRevenue, 0)}</p>
            </div>
          </div>
        )}

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(['ALL', 'PENDING', 'ACCEPTED', 'READY', 'COMPLETED', 'REJECTED'] as const).map(status => (
            <button
              key={status}
              onClick={() => {
                setFilter(status);
                setPage(0);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === status
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-300 border border-gray-700'
              }`}
            >
              {status === 'ALL' ? t('filterAll') : status}
            </button>
          ))}
        </div>

        {/* Orders List */}
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center text-gray-400">
              {t('empty')}
            </div>
          ) : (
            orders.map((order) => {
              const StatusIcon = statusIcons[order.status];
              return (
                <div key={order.id} className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Order Info */}
                    <div>
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-sm text-gray-400 mb-1">{t('orderNumber', { id: order.id.slice(0, 8) })}</p>
                          <p className="text-lg font-bold">{order.customerName}</p>
                          <p className="text-sm text-gray-400">{order.customerEmail}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1 ${statusColors[order.status]}`}>
                          <StatusIcon size={14} />
                          {order.status}
                        </span>
                      </div>

                      <div className="text-sm mb-4">
                        <p className="text-gray-400">
                          <span className="font-semibold text-gray-300">{order.items.length}</span> {order.items.length > 1 ? t('orderItems_plural') : t('orderItems_singular')}
                        </p>
                        <p className="text-gray-400">
                          {t('orderAmount')} <span className="text-green-400 font-bold">{euro(order.totalAmount)}</span>
                        </p>
                        <p className="text-gray-400 text-xs mt-2">
                          {new Date(order.createdAt).toLocaleDateString('fr-FR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <Link
                          href={`/merchant/${orgId}/orders/${order.id}`}
                          className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded text-xs font-medium hover:bg-blue-600/30 transition-colors"
                        >
                          <Eye size={14} className="inline mr-1" />
                          {t('orderDetails')}
                        </Link>
                      </div>
                    </div>

                    {/* Status Change */}
                    <div>
                      <p className="text-sm font-semibold text-gray-300 mb-3">{t('statusChange')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(['PENDING', 'ACCEPTED', 'READY', 'COMPLETED', 'REJECTED'] as const).map(status => (
                          <button
                            key={status}
                            onClick={() => handleStatusChange(order.id, status)}
                            disabled={updating === order.id || order.status === status}
                            className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
                              order.status === status
                                ? 'bg-gray-600/50 text-gray-400 border border-gray-600 cursor-default'
                                : `${statusColors[status]} border hover:opacity-80`
                            }`}
                          >
                            {updating === order.id ? '...' : status}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 px-6 py-4 bg-gray-800 border border-gray-700 rounded-lg">
            <p className="text-sm text-gray-400">
              {t('paginationPage', { page: page + 1, totalPages })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 disabled:text-gray-600 rounded transition-colors"
              >
                {t('paginationPrev')}
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page === totalPages - 1}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 disabled:text-gray-600 rounded transition-colors"
              >
                {t('paginationNext')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
