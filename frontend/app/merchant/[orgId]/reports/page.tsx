'use client';

import { signalerErreur } from '@/lib/erreurs';

import { useState, useCallback } from 'react';
import { Download, TrendingUp, DollarSign, ShoppingCart, Users } from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';
import { useTranslations } from 'next-intl';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SalesReport {
  totalOrders: number;
  totalRevenue: number;
  totalTax: number;
  totalFees: number;
  averageOrderValue: number;
  statusBreakdown: { [key: string]: number };
  paymentBreakdown: { [key: string]: number };
}

interface Product {
  id: string;
  name: string;
  sku: string;
  totalSold: number;
  totalRevenue: number;
  avgPrice: number;
  status: string;
}

interface Customer {
  email: string;
  name: string;
  totalSpent: number;
  orderCount: number;
  lastOrder: string;
  averageOrderValue: number;
}

interface RevenueData {
  date: string;
  revenue: number;
  tax: number;
  fees: number;
  count: number;
}

type TabType = 'sales' | 'revenue' | 'products' | 'customers';

export default function ReportsPage() {
  const t = useTranslations('merchantreports');

  const { storeId } = useCurrentStore();
  const [activeTab, setActiveTab] = useState<TabType>('sales');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');



  const fetchAllReports = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const params = new URLSearchParams({ storeId });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const [salesRes, revenueRes, productsRes, customersRes] = await Promise.all([
        fetch(`${API_URL}/api/reports/sales?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/reports/revenue?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/reports/products/${storeId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/reports/customers/${storeId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (salesRes.ok) setSalesReport(await salesRes.json());
      if (revenueRes.ok) {
        const data = await revenueRes.json();
        setRevenueData(data.data || []);
      }
      if (productsRes.ok) {
        const data = await productsRes.json();
        setProducts(data.products || []);
      }
      if (customersRes.ok) {
        const data = await customersRes.json();
        setCustomers(data.customers || []);
      }
    } catch (error) {
      signalerErreur('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate, storeId]);

  useEffectChargement(() => {
    if (storeId) {
      fetchAllReports();
    }
  }, [storeId, startDate, endDate, fetchAllReports]);

  const handleExport = async (type: string) => {
    setExporting(true);
    try {
      const token = localStorage.getItem('accessToken');
      const params = new URLSearchParams({ storeId });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`${API_URL}/api/reports/export/${type}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}_report_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      signalerErreur('Error exporting report:', error);
    } finally {
      setExporting(false);
    }
  };

  if (loading && !salesReport) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="text-gray-900">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <TrendingUp className="text-amber-500" />
            Rapports & Analytics
          </h1>
          <p className="text-gray-500 mt-2">Analysez les performances de votre boutique</p>
        </div>

        {/* Filters */}
        <div className="mt-6 bg-white rounded-lg p-4 border border-gray-200 flex gap-4 items-end">
          <div>
            <label className="text-gray-700 text-sm block mb-2">Date Début</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 bg-gray-100 text-gray-900 rounded border border-gray-300 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-gray-700 text-sm block mb-2">Date Fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 bg-gray-100 text-gray-900 rounded border border-gray-300 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 border-b border-gray-200">
          <div className="flex gap-8">
            {[
              { id: 'sales' as TabType, label: 'Ventes', icon: ShoppingCart },
              { id: 'revenue' as TabType, label: 'Revenus', icon: DollarSign },
              { id: 'products' as TabType, label: 'Produits', icon: TrendingUp },
              { id: 'customers' as TabType, label: t('customers'), icon: Users },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                  activeTab === id
                    ? 'border-amber-500 text-amber-500'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Sales Tab */}
        {activeTab === 'sales' && salesReport && (
          <div className="mt-6 space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <p className="text-gray-500 text-sm">Total Commandes</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{salesReport.totalOrders}</p>
              </div>
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <p className="text-gray-500 text-sm">Revenu Total</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{salesReport.totalRevenue.toFixed(2)} €</p>
              </div>
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <p className="text-gray-500 text-sm">Panier Moyen</p>
                <p className="text-3xl font-bold text-blue-600 mt-2">{salesReport.averageOrderValue.toFixed(2)} €</p>
              </div>
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <p className="text-gray-500 text-sm">Taxes</p>
                <p className="text-3xl font-bold text-yellow-600 mt-2">{salesReport.totalTax.toFixed(2)} €</p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Statut Commandes</h3>
                <div className="space-y-2">
                  {Object.entries(salesReport.statusBreakdown).map(([status, count]) => (
                    <div key={status} className="flex justify-between items-center">
                      <span className="text-gray-700">{status}</span>
                      <span className="text-gray-900 font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Statut Paiement</h3>
                <div className="space-y-2">
                  {Object.entries(salesReport.paymentBreakdown).map(([status, count]) => (
                    <div key={status} className="flex justify-between items-center">
                      <span className="text-gray-700">{status}</span>
                      <span className="text-gray-900 font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => handleExport('sales')}
              disabled={exporting}
              className="bg-orange-600 text-white hover:bg-orange-700 flex items-center gap-2 px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              <Download size={20} />
              Exporter en CSV
            </button>
          </div>
        )}

        {/* Revenue Tab */}
        {activeTab === 'revenue' && revenueData.length > 0 && (
          <div className="mt-6">
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-gray-900">Date</th>
                    <th className="px-6 py-3 text-left text-gray-900">Revenu</th>
                    <th className="px-6 py-3 text-left text-gray-900">Taxes</th>
                    <th className="px-6 py-3 text-left text-gray-900">Frais</th>
                    <th className="px-6 py-3 text-left text-gray-900">Commandes</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueData.map((row) => (
                    <tr key={row.date} className="border-t border-gray-300">
                      <td className="px-6 py-3 text-gray-700">{row.date}</td>
                      <td className="px-6 py-3 text-green-600 font-semibold">{row.revenue.toFixed(2)} €</td>
                      <td className="px-6 py-3 text-yellow-600">{row.tax.toFixed(2)} €</td>
                      <td className="px-6 py-3 text-red-600">{row.fees.toFixed(2)} €</td>
                      <td className="px-6 py-3 text-gray-900">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={() => handleExport('revenue')}
              disabled={exporting}
              className="bg-orange-600 text-white hover:bg-orange-700 mt-4 flex items-center gap-2 px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              <Download size={20} />
              Exporter en CSV
            </button>
          </div>
        )}

        {/* Products Tab */}
        {activeTab === 'products' && products.length > 0 && (
          <div className="mt-6">
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-gray-900">Produit</th>
                    <th className="px-6 py-3 text-left text-gray-900">SKU</th>
                    <th className="px-6 py-3 text-left text-gray-900">Vendus</th>
                    <th className="px-6 py-3 text-left text-gray-900">Revenu</th>
                    <th className="px-6 py-3 text-left text-gray-900">Prix Moyen</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-t border-gray-300">
                      <td className="px-6 py-3 text-gray-900 font-medium">{product.name}</td>
                      <td className="px-6 py-3 text-gray-500">{product.sku}</td>
                      <td className="px-6 py-3 text-gray-900">{product.totalSold}</td>
                      <td className="px-6 py-3 text-green-600 font-semibold">{product.totalRevenue.toFixed(2)} €</td>
                      <td className="px-6 py-3 text-blue-600">{product.avgPrice.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={() => handleExport('products')}
              disabled={exporting}
              className="bg-orange-600 text-white hover:bg-orange-700 mt-4 flex items-center gap-2 px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              <Download size={20} />
              Exporter en CSV
            </button>
          </div>
        )}

        {/* Customers Tab */}
        {activeTab === 'customers' && customers.length > 0 && (
          <div className="mt-6">
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-gray-900">Nom</th>
                    <th className="px-6 py-3 text-left text-gray-900">Email</th>
                    <th className="px-6 py-3 text-left text-gray-900">Commandes</th>
                    <th className="px-6 py-3 text-left text-gray-900">Total Dépensé</th>
                    <th className="px-6 py-3 text-left text-gray-900">Panier Moyen</th>
                    <th className="px-6 py-3 text-left text-gray-900">Dernière Visite</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.email} className="border-t border-gray-300">
                      <td className="px-6 py-3 text-gray-900 font-medium">{customer.name}</td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{customer.email}</td>
                      <td className="px-6 py-3 text-gray-900">{customer.orderCount}</td>
                      <td className="px-6 py-3 text-green-600 font-semibold">{customer.totalSpent.toFixed(2)} €</td>
                      <td className="px-6 py-3 text-blue-600">{customer.averageOrderValue.toFixed(2)} €</td>
                      <td className="px-6 py-3 text-gray-500 text-xs">
                        {new Date(customer.lastOrder).toLocaleDateString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={() => handleExport('customers')}
              disabled={exporting}
              className="bg-orange-600 text-white hover:bg-orange-700 mt-4 flex items-center gap-2 px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              <Download size={20} />
              Exporter en CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
