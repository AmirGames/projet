'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Eye, Printer, CheckCircle, XCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Order {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'READY' | 'COMPLETED' | 'REJECTED';
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalAmount: number;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  deliveryType: 'PICKUP' | 'DELIVERY';
  deliveryAddress?: string;
  deliveryCity?: string;
  pickupTime?: string;
  createdAt: string;
  notes?: string;
}

const statusColors = {
  PENDING: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/50',
  ACCEPTED: 'bg-blue-600/20 text-blue-400 border-blue-600/50',
  READY: 'bg-green-600/20 text-green-400 border-green-600/50',
  COMPLETED: 'bg-purple-600/20 text-purple-400 border-purple-600/50',
  REJECTED: 'bg-red-600/20 text-red-400 border-red-600/50',
};

const statusLabels = {
  PENDING: '⏳ En attente',
  ACCEPTED: '✅ Acceptée',
  READY: '📦 Prête',
  COMPLETED: '✓ Complétée',
  REJECTED: '❌ Rejetée',
};

export default function OrdersPage() {
  const params = useParams();
  const orgId = params?.orgId as string;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (orgId) {
      fetchOrders();
    }
  }, [orgId, filterStatus]);

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const url = filterStatus === 'ALL'
        ? `${API_URL}/api/orders?orgId=${orgId}`
        : `${API_URL}/api/orders?orgId=${orgId}&status=${filterStatus}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders || []);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setOrders(prev => prev.map(o =>
          o.id === orderId ? { ...o, status: newStatus as any } : o
        ));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder({ ...selectedOrder, status: newStatus as any });
        }
      }
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  };

  const viewOrderDetails = (order: Order) => {
    setSelectedOrder(order);
    setShowDetails(true);
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-900">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-400">Chargement des commandes...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">📦 Gestion des Commandes</h1>
          <p className="text-gray-400 mt-1">Gérez toutes vos commandes en un seul endroit</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Total</p>
            <p className="text-3xl font-bold">{orders.length}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm">En Attente</p>
            <p className="text-3xl font-bold text-yellow-400">{orders.filter(o => o.status === 'PENDING').length}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Prêtes</p>
            <p className="text-3xl font-bold text-green-400">{orders.filter(o => o.status === 'READY').length}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Revenu</p>
            <p className="text-3xl font-bold text-purple-400">${(orders.reduce((sum, o) => sum + Number(o.totalAmount), 0) / 100).toFixed(0)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Filtrer:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-red-500"
            >
              <option value="ALL">Toutes les commandes</option>
              <option value="PENDING">En attente</option>
              <option value="ACCEPTED">Acceptées</option>
              <option value="READY">Prêtes</option>
              <option value="COMPLETED">Complétées</option>
              <option value="REJECTED">Rejetées</option>
            </select>
          </div>
        </div>

        {/* Orders List */}
        <div className="space-y-3">
          {orders.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 border border-gray-700 rounded-lg">
              <p className="text-gray-400">Aucune commande trouvée</p>
            </div>
          ) : (
            orders.map(order => (
              <div
                key={order.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-red-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="font-bold">Commande #{order.id.slice(-8)}</p>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[order.status]}`}>
                        {statusLabels[order.status]}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-2">
                      <div>
                        <p className="text-gray-400">Client</p>
                        <p className="font-semibold">{order.customerName}</p>
                        <p className="text-xs text-gray-500">{order.customerEmail}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">{order.deliveryType === 'PICKUP' ? 'Retrait' : 'Livraison'}</p>
                        {order.deliveryType === 'PICKUP' && order.pickupTime && (
                          <p className="font-semibold">{new Date(order.pickupTime).toLocaleString('fr-FR')}</p>
                        )}
                        {order.deliveryType === 'DELIVERY' && order.deliveryAddress && (
                          <p className="font-semibold">{order.deliveryAddress}, {order.deliveryCity}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-gray-400">Montant</p>
                        <p className="text-2xl font-bold text-red-400">${(Number(order.totalAmount) / 100).toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleString('fr-FR')}
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => viewOrderDetails(order)}
                      className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                      title="Détails"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                      title="Imprimer"
                    >
                      <Printer size={18} />
                    </button>
                  </div>
                </div>

                {/* Quick Actions */}
                {order.status === 'PENDING' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700">
                    <button
                      onClick={() => handleStatusUpdate(order.id, 'ACCEPTED')}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={16} /> Accepter
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(order.id, 'REJECTED')}
                      className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <XCircle size={16} /> Rejeter
                    </button>
                  </div>
                )}

                {order.status === 'ACCEPTED' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700">
                    <button
                      onClick={() => handleStatusUpdate(order.id, 'READY')}
                      className="flex-1 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      ✓ Prête
                    </button>
                  </div>
                )}

                {order.status === 'READY' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700">
                    <button
                      onClick={() => handleStatusUpdate(order.id, 'COMPLETED')}
                      className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 rounded font-semibold text-sm transition-colors"
                    >
                      ✓ Complétée
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Order Details Modal */}
      {showDetails && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Commande #{selectedOrder.id.slice(-8)}</h2>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Customer Info */}
              <div>
                <h3 className="text-lg font-bold mb-3">Informations Client</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Nom</p>
                    <p className="font-semibold">{selectedOrder.customerName}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Email</p>
                    <p className="font-semibold">{selectedOrder.customerEmail}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Téléphone</p>
                    <p className="font-semibold">{selectedOrder.customerPhone}</p>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <h3 className="text-lg font-bold mb-3">Articles</h3>
                <div className="space-y-2">
                  {selectedOrder.items.map(item => (
                    <div key={item.id} className="flex justify-between text-sm bg-gray-700 p-2 rounded">
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-gray-400">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-bold">${(Number(item.price) / 100).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t border-gray-700 pt-4">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-red-400">${(Number(selectedOrder.totalAmount) / 100).toFixed(2)}</span>
                </div>
              </div>

              {/* Delivery Info */}
              <div className="bg-gray-700 p-4 rounded">
                <p className="text-gray-400 text-sm mb-2">{selectedOrder.deliveryType === 'PICKUP' ? 'Retrait' : 'Livraison'}</p>
                {selectedOrder.deliveryType === 'PICKUP' && selectedOrder.pickupTime && (
                  <p className="font-semibold">{new Date(selectedOrder.pickupTime).toLocaleString('fr-FR')}</p>
                )}
                {selectedOrder.deliveryType === 'DELIVERY' && selectedOrder.deliveryAddress && (
                  <p className="font-semibold">{selectedOrder.deliveryAddress}, {selectedOrder.deliveryCity}</p>
                )}
              </div>

              {selectedOrder.notes && (
                <div className="bg-yellow-600/20 border border-yellow-600/50 p-3 rounded">
                  <p className="text-sm text-yellow-400"><strong>Notes:</strong> {selectedOrder.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
