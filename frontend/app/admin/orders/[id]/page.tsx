'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';

interface Order {
  id: string;
  customerEmail: string;
  customerPhone: string;
  customerName?: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  deliveryType?: string;
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState('');

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      // Note: The API doesn't have a getOrder by ID endpoint
      // In production, implement GET /api/orders/:id
      setLoading(false);
    } catch (error) {
      console.error('Erreur chargement commande:', error);
      setLoading(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!newStatus) return;

    try {
      const token = localStorage.getItem('accessToken') || '';
      await apiClient.updateOrderStatus(orderId, newStatus, token);
      if (order) {
        setOrder({ ...order, status: newStatus });
        setNewStatus('');
      }
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
    }
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  const statusColors: Record<string, string> = {
    'PENDING': 'bg-yellow-500/20 text-yellow-400',
    'ACCEPTED': 'bg-blue-500/20 text-blue-400',
    'READY': 'bg-purple-500/20 text-purple-400',
    'COMPLETED': 'bg-green-500/20 text-green-400',
    'REJECTED': 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/orders" className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Détails de la commande</h1>
          <p className="text-gray-400 mt-1">Commande #{orderId.slice(0, 8)}</p>
        </div>
      </div>

      {/* Order Info */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-bold">Informations de la commande</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-400">Email client</p>
            <p className="font-medium">{order?.customerEmail || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Téléphone</p>
            <p className="font-medium">{order?.customerPhone || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Montant total</p>
            <p className="font-bold text-green-400">{order?.totalAmount.toFixed(2)} €</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Date</p>
            <p className="font-medium">{order?.createdAt ? new Date(order.createdAt).toLocaleDateString('fr-FR') : '-'}</p>
          </div>
        </div>
      </div>

      {/* Status Management */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-bold">Gestion du statut</h2>

        <div>
          <p className="text-sm text-gray-400 mb-2">Statut actuel</p>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${statusColors[order?.status || 'PENDING'] || statusColors['PENDING']}`}>
            {order?.status || 'N/A'}
          </span>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Changer le statut</label>
          <div className="flex gap-2">
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Sélectionner un statut</option>
              <option value="PENDING">En attente</option>
              <option value="ACCEPTED">Acceptée</option>
              <option value="READY">Prête</option>
              <option value="COMPLETED">Complétée</option>
              <option value="REJECTED">Rejetée</option>
            </select>
            <button
              onClick={handleStatusUpdate}
              disabled={!newStatus}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors font-medium"
            >
              Mettre à jour
            </button>
          </div>
        </div>
      </div>

      {/* Back Button */}
      <div>
        <Link
          href="/admin/orders"
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors inline-block"
        >
          Retour aux commandes
        </Link>
      </div>
    </div>
  );
}
