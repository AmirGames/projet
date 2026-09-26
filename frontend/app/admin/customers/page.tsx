'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState } from 'react';
import { Search, Eye, Mail } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useEffectChargement } from '@/lib/use-effect-chargement';

interface Customer {
  id: string;
  email: string;
  phone: string;
  createdAt: string;
  orders: number;
  totalSpent: number;
}

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchCustomers = async () => {
    try {
      const storeId = localStorage.getItem('storeId') || '19c84158-7858-453f-9955-e95c01c4e895';
      const token = localStorage.getItem('accessToken') || '';
      const data = await apiClient.getOrders(storeId, token);
      const orders = Array.isArray(data) ? data : data.orders || [];

      // Groupe les commandes par client
      const customerMap = new Map<string, Customer>();

      orders.forEach((order: any) => {
        if (!customerMap.has(order.customerEmail)) {
          customerMap.set(order.customerEmail, {
            id: order.id,
            email: order.customerEmail,
            phone: order.customerPhone,
            createdAt: order.createdAt,
            orders: 0,
            totalSpent: 0,
          });
        }

        const customer = customerMap.get(order.customerEmail)!;
        customer.orders += 1;
        customer.totalSpent += order.totalAmount || 0;
      });

      setCustomers(Array.from(customerMap.values()));
    } catch (error) {
      signalerErreur('Erreur chargement clients:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffectChargement(() => {
    fetchCustomers();
  }, []);

  const filteredCustomers = customers.filter(c =>
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Clients</h1>
        <p className="text-gray-400 mt-1">{customers.length} clients</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={20} className="absolute left-3 top-3 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher par email ou téléphone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Customers Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700/50 border-b border-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold">Email</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Téléphone</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Commandes</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Total dépensé</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Date inscription</th>
              <th className="px-6 py-3 text-right text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer) => (
                <tr key={customer.email} className="hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4">{customer.email}</td>
                  <td className="px-6 py-4">{customer.phone}</td>
                  <td className="px-6 py-4 font-semibold">{customer.orders}</td>
                  <td className="px-6 py-4 font-bold text-green-400">
                    {customer.totalSpent.toFixed(2)} €
                  </td>
                  <td className="px-6 py-4 text-gray-400">
                    {new Date(customer.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
                        <Eye size={18} className="text-blue-400" />
                      </button>
                      <button className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
                        <Mail size={18} className="text-gray-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  Aucun client trouvé
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}