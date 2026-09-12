'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface Order {
  id: string;
  customerEmail: string;
  customerPhone: string;
  totalAmount: number;
  status: string;
  createdAt: string;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const storeId = localStorage.getItem('storeId') || '19c84158-7858-453f-9955-e95c01c4e895';
      const token = localStorage.getItem('accessToken') || '';
      const data = await apiClient.getOrders(storeId, token);
      setOrders(Array.isArray(data) ? data : data.orders || []);
    } catch (error) {
      console.error('Erreur chargement commandes:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = filterStatus === 'ALL' 
    ? orders 
    : orders.filter(o => o.status === filterStatus);

  const statuses = ['ALL', 'PENDING', 'ACCEPTED', 'READY', 'COMPLETED'];

  const statusColors: Record<string, string> = {
    'PENDING': 'bg-yellow-500/20 text-yellow-400',
    'ACCEPTED': 'bg-blue-500/20 text-blue-400',
    'READY': 'bg-purple-500/20 text-purple-400',
    'COMPLETED': 'bg-green-500/20 text-green-400',
    'REJECTED': 'bg-red-500/20 text-red-400',
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Commandes</h1>
        <p className="text-gray-400 mt-1">{orders.length} commandes</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterStatus === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700/50 border-b border-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold">Commande ID</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Client</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Montant</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Statut</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Date</th>
              <th className="px-6 py-3 text-right text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-sm">{order.id.slice(0, 8)}</td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium">{order.customerEmail}</p>
                      <p className="text-sm text-gray-400">{order.customerPhone}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold">{order.totalAmount.toFixed(2)} €</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[order.status] || statusColors['PENDING']}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="inline-flex items-center gap-2 p-2 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <Eye size={18} className="text-blue-400" />
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  Aucune commande trouvée
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}