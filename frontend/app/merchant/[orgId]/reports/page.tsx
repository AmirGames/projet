'use client';


import { useEffect, useState, useCallback } from 'react';
import { Download, TrendingUp, DollarSign, ShoppingCart, Users } from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';
import { useTranslations } from 'next-intl';

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
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate, storeId]);

  useEffect(() => {
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
      console.error('Error exporting report:', error);
    } finally {
      setExporting(false);
    }
  };

  if (loading && !salesReport) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <TrendingUp className="text-amber-500" />
            Rapports & Analytics
          </h1>
          <p className="text-slate-400 mt-2">Analysez les performances de votre boutique</p>
        </div>

        {/* Filters */}
        <div className="mt-6 bg-slate-800 rounded-lg p-4 border border-slate-700 flex gap-4 items-end">
          <div>
            <label className="text-slate-300 text-sm block mb-2">Date Début</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-slate-300 text-sm block mb-2">Date Fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 border-b border-slate-700">
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
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <p className="text-slate-400 text-sm">Total Commandes</p>
                <p className="text-3xl font-bold text-white mt-2">{salesReport.totalOrders}</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <p className="text-slate-400 text-sm">Revenu Total</p>
                <p className="text-3xl font-bold text-green-400 mt-2">{salesReport.totalRevenue.toFixed(2)} €</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <p className="text-slate-400 text-sm">Panier Moyen</p>
                <p className="text-3xl font-bold text-blue-400 mt-2">{salesReport.averageOrderValue.toFixed(2)} €</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <p className="text-slate-400 text-sm">Taxes</p>
                <p className="text-3xl font-bold text-yellow-400 mt-2">{salesReport.totalTax.toFixed(2)} €</p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-4">Statut Commandes</h3>
                <div className="space-y-2">
                  {Object.entries(salesReport.statusBreakdown).map(([status, count]) => (
                    <div key={status} className="flex justify-between items-center">
                      <span className="text-slate-300">{status}</span>
                      <span className="text-white font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-4">Statut Paiement</h3>
                <div className="space-y-2">
                  {Object.entries(salesReport.paymentBreakdown).map(([status, count]) => (
                    <div key={status} className="flex justify-between items-center">
                      <span className="text-slate-300">{status}</span>
                      <span className="text-white font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => handleExport('sales')}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
            >
              <Download size={20} />
              Exporter en CSV
            </button>
          </div>
        )}

        {/* Revenue Tab */}
        {activeTab === 'revenue' && revenueData.length > 0 && (
          <div className="mt-6">
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-white">Date</th>
                    <th className="px-6 py-3 text-left text-white">Revenu</th>
                    <th className="px-6 py-3 text-left text-white">Taxes</th>
                    <th className="px-6 py-3 text-left text-white">Frais</th>
                    <th className="px-6 py-3 text-left text-white">Commandes</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueData.map((row) => (
                    <tr key={row.date} className="border-t border-slate-600">
                      <td className="px-6 py-3 text-slate-300">{row.date}</td>
                      <td className="px-6 py-3 text-green-400 font-semibold">{row.revenue.toFixed(2)} €</td>
                      <td className="px-6 py-3 text-yellow-400">{row.tax.toFixed(2)} €</td>
                      <td className="px-6 py-3 text-red-400">{row.fees.toFixed(2)} €</td>
                      <td className="px-6 py-3 text-white">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={() => handleExport('revenue')}
              disabled={exporting}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
            >
              <Download size={20} />
              Exporter en CSV
            </button>
          </div>
        )}

        {/* Products Tab */}
        {activeTab === 'products' && products.length > 0 && (
          <div className="mt-6">
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-white">Produit</th>
                    <th className="px-6 py-3 text-left text-white">SKU</th>
                    <th className="px-6 py-3 text-left text-white">Vendus</th>
                    <th className="px-6 py-3 text-left text-white">Revenu</th>
                    <th className="px-6 py-3 text-left text-white">Prix Moyen</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-t border-slate-600">
                      <td className="px-6 py-3 text-white font-medium">{product.name}</td>
                      <td className="px-6 py-3 text-slate-400">{product.sku}</td>
                      <td className="px-6 py-3 text-white">{product.totalSold}</td>
                      <td className="px-6 py-3 text-green-400 font-semibold">{product.totalRevenue.toFixed(2)} €</td>
                      <td className="px-6 py-3 text-blue-400">{product.avgPrice.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={() => handleExport('products')}
              disabled={exporting}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
            >
              <Download size={20} />
              Exporter en CSV
            </button>
          </div>
        )}

        {/* Customers Tab */}
        {activeTab === 'customers' && customers.length > 0 && (
          <div className="mt-6">
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-white">Nom</th>
                    <th className="px-6 py-3 text-left text-white">Email</th>
                    <th className="px-6 py-3 text-left text-white">Commandes</th>
                    <th className="px-6 py-3 text-left text-white">Total Dépensé</th>
                    <th className="px-6 py-3 text-left text-white">Panier Moyen</th>
                    <th className="px-6 py-3 text-left text-white">Dernière Visite</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.email} className="border-t border-slate-600">
                      <td className="px-6 py-3 text-white font-medium">{customer.name}</td>
                      <td className="px-6 py-3 text-slate-400 text-xs">{customer.email}</td>
                      <td className="px-6 py-3 text-white">{customer.orderCount}</td>
                      <td className="px-6 py-3 text-green-400 font-semibold">{customer.totalSpent.toFixed(2)} €</td>
                      <td className="px-6 py-3 text-blue-400">{customer.averageOrderValue.toFixed(2)} €</td>
                      <td className="px-6 py-3 text-slate-400 text-xs">
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
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
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
