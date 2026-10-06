'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Download, Eye } from 'lucide-react';
import Link from 'next/link';

import { useCurrentStore } from '@/lib/current-store';

import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';

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
  SUCCEEDED: 'bg-green-50 text-green-600 border-green-200',
  PENDING: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  FAILED: 'bg-red-50 text-red-600 border-red-200',
  REFUNDED: 'bg-gray-600/20 text-gray-700 border-gray-600/50',
};

export default function InvoicesPage() {
  const t = useTranslations('merchantInvoices');
  const locale = useLocale();
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

  const fetchInvoices = useCallback(async () => {
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
      if (filter !== 'ALL') query.set('status', filter);

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
      signalerErreur('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  }, [page, router, storeId, filter]);

  const fetchStats = useCallback(async () => {
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
      signalerErreur('Error fetching stats:', error);
    }
  }, [storeId]);

  useEffectChargement(() => {
    if (storeId) {
      fetchInvoices();
      fetchStats();
    }
  }, [storeId, page, filter, fetchInvoices, fetchStats]);

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
      signalerErreur('Error downloading invoice:', error);
    }
  };

  const generateCSV = (invoice: any) => {
    // Un champ peut contenir une virgule ou un guillemet (« Pizza, grande ») :
    // entre guillemets, il reste dans sa colonne.
    const champ = (valeur: unknown) => `"${String(valeur ?? '').replace(/"/g, '""')}"`;
    const ligne = (...valeurs: unknown[]) => valeurs.map(champ).join(',') + '\n';
    const date = (iso: string) => new Date(iso).toLocaleDateString(locale);

    let csv = `${t('csv.facture')}\n\n`;
    csv += ligne(t('csv.numero'), invoice.invoiceNumber);
    csv += ligne(t('csv.date'), date(invoice.invoiceDate));
    csv += ligne(t('csv.echeance'), date(invoice.dueDate)) + '\n';

    csv += `${t('csv.boutique')}\n`;
    csv += ligne(invoice.storeInfo.name);
    csv += ligne(invoice.storeInfo.address);
    csv += ligne(invoice.storeInfo.city);
    csv += ligne(invoice.storeInfo.email);
    csv += ligne(invoice.storeInfo.phone) + '\n';

    csv += `${t('csv.client')}\n`;
    csv += ligne(invoice.customerInfo.name);
    csv += ligne(invoice.customerInfo.email);
    csv += ligne(invoice.customerInfo.phone) + '\n';

    csv += `${t('csv.articles')}\n`;
    csv += ligne(t('csv.description'), t('csv.sku'), t('csv.quantite'), t('csv.prixUnitaire'), t('csv.total'));
    invoice.items.forEach((item: any) => {
      csv += ligne(item.description, item.sku, item.quantity, item.unitPrice, item.total);
    });

    csv += `\n${t('csv.resume')}\n`;
    csv += ligne(t('csv.sousTotal'), invoice.subtotal);
    csv += ligne(t('csv.taxes'), invoice.tax);
    csv += ligne(t('csv.frais'), invoice.fees);
    csv += ligne(t('csv.totalMaj'), invoice.total);

    return csv;
  };

  const totalPages = Math.ceil(total / itemsPerPage);

  if (loading && invoices.length === 0) {
    return (
      <div className="text-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-gray-500">{t('loading')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-gray-900">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <Link
              href={`/merchant/${orgId}/dashboard`}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              {t('backDashboard')}
            </Link>
          </div>
          <p className="text-gray-500">{t('description')}</p>
        </div>

        {/* Revenue Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <p className="text-gray-500 text-sm mb-1">{t('statsTotalRevenue')}</p>
              <p className="text-3xl font-bold text-green-600">{euro(stats.totalRevenue)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <p className="text-gray-500 text-sm mb-1">{t('statsNetRevenue')}</p>
              <p className="text-3xl font-bold">{euro(stats.netRevenue)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <p className="text-gray-500 text-sm mb-1">{t('statsInvoiceCount')}</p>
              <p className="text-3xl font-bold">{stats.invoiceCount}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <p className="text-gray-500 text-sm mb-1">{t('statsAverageInvoice')}</p>
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
                  ? 'bg-gray-900 text-white'
                  : 'bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-700 border border-gray-200'
              }`}
            >
              {status === 'ALL' ? t('filterAll') : status}
            </button>
          ))}
        </div>

        {/* Invoices Table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-300">
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
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      {t('empty')}
                    </td>
                  </tr>
                ) : (
                  invoices.map((invoice) => (
                    <tr key={invoice.orderId} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div>
                          <p className="font-medium text-gray-900">{invoice.customerName}</p>
                          <p className="text-xs text-gray-500">{invoice.customerEmail}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-green-600">
                        {euro(invoice.amount)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {t('articles', { n: invoice.itemCount })}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[invoice.status] || statusColors.PENDING}`}>
                          {invoice.status === 'SUCCEEDED' && t('statusSucceeded')}
                          {invoice.status === 'PENDING' && t('statusPending')}
                          {invoice.status === 'FAILED' && t('statusFailed')}
                          {invoice.status === 'REFUNDED' && t('statusRefunded')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(invoice.date).toLocaleDateString(locale)}
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/merchant/${orgId}/invoices/${invoice.orderId}`}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            title={t('actionView')}
                          >
                            <Eye size={18} className="text-blue-600" />
                          </Link>
                          <button
                            onClick={() => handleDownloadInvoice(invoice.orderId, invoice.invoiceNumber)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            title={t('actionDownload')}
                          >
                            <Download size={18} className="text-green-600" />
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
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                {t('pagination', { page: page + 1, totalPages })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 rounded transition-colors"
                >
                  {t('previous')}
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page === totalPages - 1}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 rounded transition-colors"
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
