'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, Eye } from 'lucide-react';
import Link from 'next/link';

import { useCurrentStore } from '@/lib/current-store';

import { euro } from '@/lib/format';

import { useTranslations } from 'next-intl';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Invoice {
  invoiceNumber: string;
  orderId: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  itemCount: number;
  status: string;
  orderStatus: string;
  date: string;
}

const statusColors: Record<string, string> = {
  SUCCEEDED: 'bg-green-600/20 text-green-400 border-green-600/50',
  PENDING: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/50',
  FAILED: 'bg-red-600/20 text-red-400 border-red-600/50',
};

export default function InvoicesPage() {
  const t = useTranslations('merchantInvoices');
  const { storeId } = useCurrentStore();
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState<'ALL' | 'SUCCEEDED' | 'PENDING' | 'FAILED'>('ALL');

  const itemsPerPage = 20;

  useEffect(() => {
    if (storeId) {
      fetchInvoices();
      fetchStats();
    }
  }, [storeId, page, filter]);

  const fetchInvoices = async () => {
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
      });

      const response = await fetch(`${API_URL}/api/invoices/${storeId}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }

      const data = await response.json();
      setInvoices(data.data || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/invoices/${storeId}/stats/revenue`, {
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

  const handleDownloadInvoice = async (orderId: string, invoiceNumber: string) => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/invoices/${storeId}/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch invoice');
      }

      const invoice = await response.json();
      
      const csvContent = generateCSV(invoice);
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceNumber}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading invoice:', error);
    }
  };

  const generateCSV = (invoice: any) => {
    let csv = 'FACTURE\n\n';
    csv += `Numéro: ${invoice.invoiceNumber}\n`;
    csv += `Date: ${new Date(invoice.invoiceDate).toLocaleDateString('fr-FR')}\n`;
    csv += `Échéance: ${new Date(invoice.dueDate).toLocaleDateString('fr-FR')}\n\n`;
    
    csv += 'INFORMATIONS BOUTIQUE\n';
    csv += `${invoice.storeInfo.name}\n`;
    csv += `${invoice.storeInfo.address}\n`;
    csv += `${invoice.storeInfo.city}\n`;
    csv += `${invoice.storeInfo.email}\n`;
    csv += `${invoice.storeInfo.phone}\n\n`;
    
    csv += 'CLIENT\n';
    csv += `${invoice.customerInfo.name}\n`;
    csv += `${invoice.customerInfo.email}\n`;
    csv += `${invoice.customerInfo.phone}\n\n`;
    
    csv += 'ARTICLES\n';
    csv += 'Description,SKU,Quantité,Prix Unitaire,Total\n';
    invoice.items.forEach((item: any) => {
      csv += `${item.description},${item.sku},${item.quantity},${item.unitPrice},${item.total}\n`;
    });
    
    csv += '\nRÉSUMÉ\n';
    csv += `Sous-total,${invoice.subtotal}\n`;
    csv += `Taxes,${invoice.tax}\n`;
    csv += `Frais,${invoice.fees}\n`;
    csv += `TOTAL,${invoice.total}\n`;
    
    return csv;
  };

  const totalPages = Math.ceil(total / itemsPerPage);

  if (loading && invoices.length === 0) {
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
              {t('backDashboard')}
            </Link>
          </div>
          <p className="text-gray-400">{t('description')}</p>
        </div>

        {/* Revenue Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-1">{t('statsTotalRevenue')}</p>
              <p className="text-3xl font-bold text-green-400">{euro(stats.totalRevenue)}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-1">{t('statsNetRevenue')}</p>
              <p className="text-3xl font-bold">{euro(stats.netRevenue)}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-1">{t('statsInvoiceCount')}</p>
              <p className="text-3xl font-bold">{stats.invoiceCount}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <p className="text-gray-400 text-sm mb-1">{t('statsAverageInvoice')}</p>
              <p className="text-3xl font-bold">{euro(stats.averageInvoiceAmount)}</p>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          {(['ALL', 'SUCCEEDED', 'PENDING', 'FAILED'] as const).map(status => (
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

        {/* Invoices Table */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold">{t('colNumber')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">{t('colCustomer')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">{t('colAmount')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">{t('colItems')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">{t('colPaymentStatus')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">{t('colDate')}</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                      {t('empty')}
                    </td>
                  </tr>
                ) : (
                  invoices.map((invoice) => (
                    <tr key={invoice.orderId} className="border-b border-gray-700 hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-100">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div>
                          <p className="font-medium text-gray-100">{invoice.customerName}</p>
                          <p className="text-xs text-gray-400">{invoice.customerEmail}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-green-400">
                        {euro(invoice.amount)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {invoice.itemCount} article{invoice.itemCount > 1 ? 's' : ''}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[invoice.status] || statusColors.PENDING}`}>
                          {invoice.status === 'SUCCEEDED' && t('statusSucceeded')}
                          {invoice.status === 'PENDING' && t('statusPending')}
                          {invoice.status === 'FAILED' && t('statusFailed')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {new Date(invoice.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/merchant/${orgId}/invoices/${invoice.orderId}`}
                            className="p-1 hover:bg-gray-600 rounded transition-colors"
                            title={t('actionView')}
                          >
                            <Eye size={18} className="text-blue-400" />
                          </Link>
                          <button
                            onClick={() => handleDownloadInvoice(invoice.orderId, invoice.invoiceNumber)}
                            className="p-1 hover:bg-gray-600 rounded transition-colors"
                            title={t('actionDownload')}
                          >
                            <Download size={18} className="text-green-400" />
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
              <p className="text-sm text-gray-400">
                {t('pagination', { page: page + 1, totalPages })}
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
    </div>
  );
}
