'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Bell, AlertCircle, CheckCircle, Timer } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  deliveryAddress: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  items?: any[];
  notes?: string;
}

const statusColors: Record<string, { bg: string; text: string; icon: string }> = {
  PENDING: { bg: 'bg-yellow-900', text: 'text-yellow-200', icon: '⏳' },
  CONFIRMED: { bg: 'bg-blue-900', text: 'text-blue-200', icon: '✓' },
  PREPARING: { bg: 'bg-orange-900', text: 'text-orange-200', icon: '👨‍🍳' },
  READY: { bg: 'bg-green-900', text: 'text-green-200', icon: '📦' },
  PICKED_UP: { bg: 'bg-purple-900', text: 'text-purple-200', icon: '🚗' },
  DELIVERED: { bg: 'bg-green-800', text: 'text-green-300', icon: '✓✓' },
  CANCELLED: { bg: 'bg-red-900', text: 'text-red-200', icon: '✗' },
};

const statusLabels: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  PREPARING: 'En préparation',
  READY: 'Prête',
  PICKED_UP: 'Livrée en route',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
};

export default function MerchantOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'preparing' | 'ready'>('pending');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [filter]);

  const loadOrders = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/orders?status=${filter}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders || []);
      }
    } catch (err) {
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        setOrders(orders.map(o =>
          o.id === orderId ? { ...o, status: newStatus } : o
        ));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder({ ...selectedOrder, status: newStatus });
        }
      }
    } catch (err) {
      console.error('Error updating order status:', err);
    }
  };

  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    if (filter === 'pending') return ['PENDING', 'CONFIRMED'].includes(order.status);
    if (filter === 'preparing') return order.status === 'PREPARING';
    if (filter === 'ready') return order.status === 'READY';
    return true;
  });

  const pendingCount = orders.filter(o => o.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <Link href="/merchant" className="text-gray-400 hover:text-orange-500">
              ← Retour
            </Link>
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 bg-red-900 text-red-200 px-4 py-2 rounded-lg">
                <Bell size={18} />
                <span className="font-semibold">{pendingCount} nouvelle(s) commande(s)</span>
              </div>
            )}
          </div>
          <h1 className="text-3xl font-bold text-white">Gestion des commandes</h1>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {(
            [
              { value: 'pending' as const, label: 'En attente', icon: '⏳' },
              { value: 'preparing' as const, label: 'En préparation', icon: '👨‍🍳' },
              { value: 'ready' as const, label: 'Prêtes', icon: '📦' },
              { value: 'all' as const, label: 'Toutes', icon: '📋' },
            ]
          ).map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 rounded-lg font-semibold transition flex items-center gap-2 ${
                filter === tab.value
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-white">Chargement des commandes...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12 bg-gray-800 rounded-lg">
            <p className="text-white text-lg">Aucune commande</p>
            <p className="text-gray-400">Les nouvelles commandes apparaîtront ici</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Orders List */}
            <div className="lg:col-span-2 space-y-3">
              {filteredOrders.map(order => {
                const statusInfo = statusColors[order.status] || statusColors.PENDING;
                const isSelected = selectedOrder?.id === order.id;

                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className={`bg-gray-800 rounded-lg p-4 cursor-pointer transition ${
                      isSelected ? 'ring-2 ring-orange-600 bg-gray-750' : 'hover:bg-gray-750'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <p className="text-white font-bold">Commande #{order.id.slice(0, 8)}</p>
                        <p className="text-gray-400 text-sm">{order.customerName}</p>
                      </div>
                      <div className={`${statusInfo.bg} ${statusInfo.text} px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1`}>
                        <span>{statusInfo.icon}</span>
                        {statusLabels[order.status]}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                      <div>
                        <p className="text-gray-400">Montant</p>
                        <p className="text-white font-semibold">€{(order.totalAmount / 100).toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-400">Commande à</p>
                        <p className="text-white font-semibold">{new Date(order.createdAt).toLocaleTimeString('fr-FR')}</p>
                      </div>
                    </div>

                    {isSelected && <ChevronRight size={20} className="text-orange-500" />}
                  </div>
                );
              })}
            </div>

            {/* Order Details Sidebar */}
            {selectedOrder ? (
              <div className="lg:col-span-1">
                <div className="bg-gray-800 rounded-lg p-6 sticky top-24 space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-white mb-4">Détails de la commande</h2>
                    <div className="space-y-4 text-sm">
                      <div>
                        <p className="text-gray-400">Client</p>
                        <p className="text-white font-semibold">{selectedOrder.customerName}</p>
                        <p className="text-gray-400">{selectedOrder.customerPhone}</p>
                      </div>

                      <div>
                        <p className="text-gray-400">Adresse de livraison</p>
                        <p className="text-white">{selectedOrder.deliveryAddress}</p>
                      </div>

                      {selectedOrder.notes && (
                        <div>
                          <p className="text-gray-400">Notes</p>
                          <p className="text-white italic text-xs">{selectedOrder.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Items */}
                  {selectedOrder.items && selectedOrder.items.length > 0 && (
                    <div className="pt-6 border-t border-gray-700">
                      <p className="text-gray-400 text-sm mb-3 font-semibold">Articles</p>
                      <div className="space-y-2">
                        {selectedOrder.items.map((item: any) => (
                          <div key={item.id} className="flex justify-between text-sm">
                            <div>
                              <p className="text-white">{item.name}</p>
                              <p className="text-gray-400">x{item.quantity}</p>
                            </div>
                            <p className="text-orange-400 font-semibold">
                              €{((item.price * item.quantity) / 100).toFixed(2)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {selectedOrder.status !== 'DELIVERED' && selectedOrder.status !== 'CANCELLED' && (
                    <div className="pt-6 border-t border-gray-700 space-y-3">
                      {selectedOrder.status === 'PENDING' && (
                        <button
                          onClick={() => handleStatusUpdate(selectedOrder.id, 'CONFIRMED')}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                        >
                          <CheckCircle size={18} />
                          Confirmer
                        </button>
                      )}

                      {selectedOrder.status === 'CONFIRMED' && (
                        <button
                          onClick={() => handleStatusUpdate(selectedOrder.id, 'PREPARING')}
                          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                        >
                          <Timer size={18} />
                          Commencer la préparation
                        </button>
                      )}

                      {selectedOrder.status === 'PREPARING' && (
                        <button
                          onClick={() => handleStatusUpdate(selectedOrder.id, 'READY')}
                          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                        >
                          <CheckCircle size={18} />
                          Marquer comme prête
                        </button>
                      )}

                      {selectedOrder.status === 'READY' && (
                        <div className="bg-green-900 border border-green-700 rounded-lg p-3 text-green-200 text-sm">
                          <p className="font-semibold">✓ Prête à être livrée</p>
                          <p className="text-xs">Un livreur viendra récupérer cette commande</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="lg:col-span-1">
                <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-400">
                  <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Sélectionnez une commande pour voir les détails</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
