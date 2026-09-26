'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, Mail, Phone, Trash2, Lock, Eye } from 'lucide-react';
import Link from 'next/link';

import { useCurrentStore } from '@/lib/current-store';

import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  totalOrders: number;
  totalSpent: number;
  status: string;
  lastOrderDate?: string;
  createdAt: string;
}

export default function CustomersPage() {
  const t = useTranslations('merchantCustomers');
  const { storeId } = useCurrentStore();
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const itemsPerPage = 20;

  const fetchCustomers = useCallback(async () => {
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
        ...(search && { search }),
      });

      const response = await fetch(`${API_URL}/api/customers/${storeId}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch customers');
      }

      const data = await response.json();
      setCustomers(data.data || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  }, [page, router, search, storeId]);

  useEffectChargement(() => {
    if (storeId) {
      fetchCustomers();
    }
  }, [storeId, search, page, fetchCustomers]);

  const handleDelete = async (customerId: string) => {
    try {
      setDeleting(true);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/customers/${storeId}/${customerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to delete customer');
      }

      setCustomers(customers.filter(c => c.id !== customerId));
      setShowDeleteModal(null);
    } catch (error) {
      console.error('Error deleting customer:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleBlockCustomer = async (customerId: string) => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/customers/${storeId}/${customerId}/block`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to block customer');
      }

      const updatedCustomer = await response.json();
      setCustomers(customers.map(c => c.id === customerId ? updatedCustomer.customer : c));
    } catch (error) {
      console.error('Error blocking customer:', error);
    }
  };

  const totalPages = Math.ceil(total / itemsPerPage);

  if (loading) {
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
              ← {t('backDashboard')}
            </Link>
          </div>
          <p className="text-gray-400">{t('description')}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <p className="text-gray-400 text-sm mb-1">{t('statsTotalClients')}</p>
            <p className="text-3xl font-bold">{total}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <p className="text-gray-400 text-sm mb-1">{t('statsActiveClients')}</p>
            <p className="text-3xl font-bold">{customers.filter(c => c.status === 'ACTIVE').length}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <p className="text-gray-400 text-sm mb-1">{t('statsBlockedClients')}</p>
            <p className="text-3xl font-bold text-red-400">{customers.filter(c => c.status === 'BLOCKED').length}</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-3 text-gray-500" size={20} />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="w-full pl-12 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-600"
            />
          </div>
        </div>

        {/* Customers Table */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold">{t('colName')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">{t('colEmail')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">{t('colPhone')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">{t('colOrders')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">{t('colSpending')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">{t('colStatus')}</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                      {t('empty')}
                    </td>
                  </tr>
                ) : (
                  customers.map((customer) => (
                    <tr key={customer.id} className="border-b border-gray-700 hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4">
                        <Link
                          href={`/merchant/${orgId}/customers/${customer.id}`}
                          className="text-red-400 hover:text-red-300 font-medium"
                        >
                          {customer.name}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-300">
                          <Mail size={16} />
                          {customer.email}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300">
                        {customer.phone ? (
                          <div className="flex items-center gap-2">
                            <Phone size={16} />
                            {customer.phone}
                          </div>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300">
                        {customer.totalOrders}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-300">
                        {euro(customer.totalSpent)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          customer.status === 'ACTIVE'
                            ? 'bg-green-600/20 text-green-400'
                            : customer.status === 'BLOCKED'
                            ? 'bg-red-600/20 text-red-400'
                            : 'bg-gray-600/20 text-gray-400'
                        }`}>
                          {customer.status === 'ACTIVE' && `✓ ${t('statusActive')}`}
                          {customer.status === 'BLOCKED' && `✕ ${t('statusBlocked')}`}
                          {customer.status === 'INACTIVE' && `⊘ ${t('statusInactive')}`}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/merchant/${orgId}/customers/${customer.id}`}
                            className="p-1 hover:bg-gray-600 rounded transition-colors"
                            title={t('actionView')}
                          >
                            <Eye size={18} className="text-blue-400" />
                          </Link>
                          {customer.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleBlockCustomer(customer.id)}
                              className="p-1 hover:bg-gray-600 rounded transition-colors"
                              title={t('actionBlock')}
                            >
                              <Lock size={18} className="text-orange-400" />
                            </button>
                          )}
                          <button
                            onClick={() => setShowDeleteModal(customer.id)}
                            className="p-1 hover:bg-gray-600 rounded transition-colors"
                            title={t('actionDelete')}
                          >
                            <Trash2 size={18} className="text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
              <p className="text-sm text-gray-400">{t('paginationPage', { page: page + 1, totalPages })}
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

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-sm mx-4">
              <h3 className="text-xl font-bold mb-4">{t('confirmDelete')}</h3>
              <p className="text-gray-400 mb-6">
                {t('deleteWarning')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={() => handleDelete(showDeleteModal)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 rounded-lg font-medium transition-colors"
                >
                  {deleting ? t('deleting') : t('actionDelete')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
