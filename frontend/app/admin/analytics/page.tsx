'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface Analytics {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  topProducts: Array<{ name: string; sales: number; revenue: number }>;
  dailyRevenue: Array<{ date: string; amount: number }>;
}

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState<Analytics>({
    totalRevenue: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    topProducts: [],
    dailyRevenue: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // Agrège les lignes de toutes les commandes pour classer les produits.
  const meilleuresVentes = (orders: any[], products: any[]) => {
    const parProduit = new Map<string, { name: string; sales: number; revenue: number }>();

    for (const order of orders) {
      for (const item of order.items || []) {
        const produit = products.find((p: any) => p.id === item.productId);
        const nom = produit?.name || item.product?.name || 'Produit supprimé';
        const actuel = parProduit.get(item.productId) || { name: nom, sales: 0, revenue: 0 };

        actuel.sales += Number(item.quantity || 0);
        actuel.revenue += Number(item.total || 0);
        parProduit.set(item.productId, actuel);
      }
    }

    return [...parProduit.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  };

  const fetchAnalytics = async () => {
    try {
      const storeId = localStorage.getItem('storeId');
      if (!storeId) {
        setLoading(false);
        return;
      }
      const token = localStorage.getItem('accessToken') || '';
      const [ordersRes, productsRes] = await Promise.all([
        apiClient.getOrders(storeId, token),
        apiClient.getProducts(storeId),
      ]);

      const orders = Array.isArray(ordersRes) ? ordersRes : ordersRes.orders || [];
      const products = Array.isArray(productsRes) ? productsRes : productsRes.products || [];

      const totalRevenue = orders.reduce((sum: number, order: any) => sum + Number(order.totalAmount || 0), 0);
      const totalOrders = orders.length;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      const dailyRevenue: Record<string, number> = {};
      orders.forEach((order: any) => {
        const date = new Date(order.createdAt).toLocaleDateString('fr-FR');
        dailyRevenue[date] = (dailyRevenue[date] || 0) + Number(order.totalAmount || 0);
      });

      setAnalytics({
        totalRevenue,
        totalOrders,
        averageOrderValue,
        topProducts: meilleuresVentes(orders, products),
        dailyRevenue: Object.entries(dailyRevenue).map(([date, amount]) => ({
          date,
          amount,
        })),
      });
    } catch (error) {
      console.error('Erreur chargement analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-gray-400 mt-1">Vue d'ensemble de votre boutique</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Revenue */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">Chiffre d'affaires total</p>
            <TrendingUp size={20} className="text-green-500" />
          </div>
          <p className="text-3xl font-bold">{analytics.totalRevenue.toFixed(2)} €</p>
          <p className="text-sm text-green-400 mt-2">+12% ce mois</p>
        </div>

        {/* Total Orders */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">Commandes</p>
            <BarChart3 size={20} className="text-blue-500" />
          </div>
          <p className="text-3xl font-bold">{analytics.totalOrders}</p>
          <p className="text-sm text-blue-400 mt-2">+8% ce mois</p>
        </div>

        {/* Average Order */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">Panier moyen</p>
            <TrendingUp size={20} className="text-purple-500" />
          </div>
          <p className="text-3xl font-bold">{analytics.averageOrderValue.toFixed(2)} €</p>
          <p className="text-sm text-purple-400 mt-2">+5% ce mois</p>
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Produits les plus vendus</h2>
        <div className="space-y-3">
          {analytics.topProducts.map((product, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-gray-700/50 rounded">
              <div className="flex-1">
                <p className="font-medium">{product.name}</p>
                <p className="text-sm text-gray-400">{product.sales} ventes</p>
              </div>
              <p className="font-bold text-green-400">{product.revenue.toFixed(2)} €</p>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Revenue */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Chiffre d'affaires quotidien</h2>
        <div className="space-y-3">
          {analytics.dailyRevenue.slice(0, 7).map((day, idx) => (
            <div key={idx} className="flex items-center gap-4">
              <div className="w-24 text-sm text-gray-400">{day.date}</div>
              <div className="flex-1 h-8 bg-gray-700 rounded-lg overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-blue-500"
                  style={{
                    width: `${(day.amount / Math.max(...analytics.dailyRevenue.map(d => d.amount))) * 100}%`,
                  }}
                ></div>
              </div>
              <div className="w-20 text-right font-bold">{day.amount.toFixed(2)} €</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}