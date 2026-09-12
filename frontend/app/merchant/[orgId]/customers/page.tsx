'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Mail, Phone } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Customer {
  name: string;
  email: string;
  phone: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string;
}

export default function CustomersPage() {
  const params = useParams();
  const orgId = params?.orgId as string;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'orders' | 'spent'>('name');

  useEffect(() => {
    if (orgId) {
      fetchCustomers();
    }
  }, [orgId]);

  const fetchCustomers = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/orders?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const orders = data.orders || [];

        const customersMap = new Map<string, Customer>();

        orders.forEach((order: any) => {
          const key = order.customerEmail;
          const existing = customersMap.get(key);

          if (existing) {
            existing.orderCount++;
            existing.totalSpent += order.totalAmount || 0;
            if (new Date(order.createdAt) > new Date(existing.lastOrderDate)) {
              existing.lastOrderDate = order.createdAt;
            }
          } else {
            customersMap.set(key, {
              name: order.customerName,
              email: order.customerEmail,
              phone: order.customerPhone,
              orderCount: 1,
              totalSpent: order.totalAmount || 0,
              lastOrderDate: order.createdAt,
            });
          }
        });

        setCustomers(Array.from(customersMap.values()));
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const sortedCustomers = [...customers].sort((a, b) => {
    switch (sortBy) {
      case 'orders':
        return b.orderCount - a.orderCount;
      case 'spent':
        return b.totalSpent - a.totalSpent;
      case 'name':
      default:
        return a.name.localeCompare(b.name);
    }
  });

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-900">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-400">Chargement des clients...</p>
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
          <h1 className="text-3xl font-bold">👥 Gestion des Clients</h1>
          <p className="text-gray-400 mt-1">Consultez vos clients et leurs historiques de commandes</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Total Clients</p>
            <p className="text-3xl font-bold">{customers.length}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Total Commandes</p>
            <p className="text-3xl font-bold text-blue-400">{customers.reduce((sum, c) => sum + c.orderCount, 0)}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Revenu Clients</p>
            <p className="text-3xl font-bold text-green-400">${(customers.reduce((sum, c) => sum + c.totalSpent, 0) / 100).toFixed(0)}</p>
          </div>
        </div>

        {/* Sort */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Trier par:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-red-500"
            >
              <option value="name">Nom</option>
              <option value="orders">Nombre de commandes</option>
              <option value="spent">Revenu généré</option>
            </select>
          </div>
        </div>

        {/* Customers List */}
        <div className="space-y-3">
          {sortedCustomers.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 border border-gray-700 rounded-lg">
              <p className="text-gray-400">Aucun client trouvé</p>
            </div>
          ) : (
            sortedCustomers.map((customer, index) => (
              <div
                key={index}
                className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-red-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center font-bold">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-lg">{customer.name}</p>
                        <p className="text-xs text-gray-500">Client depuis le {new Date(customer.lastOrderDate).toLocaleDateString('fr-FR')}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Mail size={16} className="text-gray-500" />
                          <span className="text-gray-300">{customer.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Phone size={16} className="text-gray-500" />
                          <span className="text-gray-300">{customer.phone}</span>
                        </div>
                      </div>

                      <div className="space-y-2 md:text-right">
                        <div className="flex items-center justify-between md:justify-end gap-4">
                          <div>
                            <p className="text-gray-400 text-xs">Commandes</p>
                            <p className="text-xl font-bold text-blue-400">{customer.orderCount}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-xs">Dépenses</p>
                            <p className="text-xl font-bold text-green-400">${(customer.totalSpent / 100).toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
