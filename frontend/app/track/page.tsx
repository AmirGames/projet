'use client';

import { useState } from 'react';
import { Search, Clock, CheckCircle, AlertCircle, Package, Truck, MapPin } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'READY' | 'COMPLETED' | 'REJECTED';
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalAmount: number;
  deliveryType: 'PICKUP' | 'DELIVERY';
  deliveryAddress?: string;
  deliveryCity?: string;
  pickupTime?: string;
  createdAt: string;
  items?: OrderItem[];
  notes?: string;
}

const statusSteps = [
  { status: 'PENDING', label: 'En Attente', icon: Clock, color: 'text-yellow-400' },
  { status: 'ACCEPTED', label: 'Acceptée', icon: CheckCircle, color: 'text-blue-400' },
  { status: 'READY', label: 'Prête', icon: Package, color: 'text-green-400' },
  { status: 'COMPLETED', label: 'Livrée', icon: Truck, color: 'text-purple-400' },
];

const statusColors: { [key: string]: string } = {
  PENDING: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/50',
  ACCEPTED: 'bg-blue-600/20 text-blue-400 border-blue-600/50',
  READY: 'bg-green-600/20 text-green-400 border-green-600/50',
  COMPLETED: 'bg-purple-600/20 text-purple-400 border-purple-600/50',
  REJECTED: 'bg-red-600/20 text-red-400 border-red-600/50',
};

export default function TrackOrderPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOrder(null);
    setHasSearched(true);
    setLoading(true);

    try {
      const query = searchQuery.trim().toLowerCase();
      if (!query) {
        setError('Veuillez entrer un numéro de commande ou un email');
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/orders/${query}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('Commande non trouvée. Vérifiez le numéro de commande ou l\'email.');
        } else {
          setError('Erreur lors de la recherche. Veuillez réessayer.');
        }
        setLoading(false);
        return;
      }

      const data = await response.json();
      setOrder(data || data.order);
    } catch (err) {
      console.error('Search error:', err);
      setError('Erreur de connexion. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIndex = (status: string) => {
    return statusSteps.findIndex(s => s.status === status);
  };

  const currentStatusIndex = order ? getStatusIndex(order.status) : -1;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">📍 Suivre Ma Commande</h1>
          <p className="text-gray-400">Entrez votre numéro de commande ou email pour suivre votre commande en temps réel</p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-gray-500" size={20} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Numéro de commande (ex: ABC123DE) ou Email..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-red-500 placeholder-gray-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Recherche...' : 'Rechercher'}
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4 flex gap-3">
            <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Order Details */}
        {order && (
          <div className="space-y-6">
            {/* Order Header */}
            <div className="bg-gradient-to-r from-red-600/20 to-orange-600/20 border border-red-600/50 rounded-lg p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Numéro de Commande</p>
                  <p className="text-2xl font-bold text-red-400">#{order.id.slice(-8).toUpperCase()}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Créée le {new Date(order.createdAt).toLocaleString('fr-FR')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400 text-sm mb-1">Statut Actuel</p>
                  <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold border ${statusColors[order.status]}`}>
                    {order.status === 'PENDING' && '⏳ En Attente'}
                    {order.status === 'ACCEPTED' && '✅ Acceptée'}
                    {order.status === 'READY' && '📦 Prête'}
                    {order.status === 'COMPLETED' && '✓ Livrée'}
                    {order.status === 'REJECTED' && '❌ Rejetée'}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Timeline */}
            {order.status !== 'REJECTED' && (
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <h2 className="text-lg font-bold mb-6">Progression de la Commande</h2>
                <div className="space-y-6">
                  {statusSteps.map((step, index) => {
                    const isCompleted = index <= currentStatusIndex;
                    const isCurrent = index === currentStatusIndex;
                    const Icon = step.icon;

                    return (
                      <div key={step.status} className="flex gap-4">
                        {/* Timeline Line */}
                        <div className="flex flex-col items-center">
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center font-bold transition-colors ${
                              isCompleted
                                ? 'bg-red-600 text-white'
                                : 'bg-gray-700 text-gray-400'
                            } ${isCurrent ? 'ring-2 ring-red-600 ring-offset-2 ring-offset-gray-800' : ''}`}
                          >
                            <Icon size={24} />
                          </div>
                          {index < statusSteps.length - 1 && (
                            <div
                              className={`w-1 h-12 mt-2 ${
                                isCompleted ? 'bg-red-600' : 'bg-gray-700'
                              }`}
                            />
                          )}
                        </div>

                        {/* Step Info */}
                        <div className="flex-1 pt-2 pb-6">
                          <p className={`font-semibold text-lg ${isCompleted ? 'text-white' : 'text-gray-400'}`}>
                            {step.label}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            {step.status === 'PENDING' && 'Votre commande a été reçue et est en attente de confirmation'}
                            {step.status === 'ACCEPTED' && 'La boutique a accepté votre commande'}
                            {step.status === 'READY' && 'Votre commande est prête à être livrée/retirée'}
                            {step.status === 'COMPLETED' && 'Commande livrée avec succès'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rejection Message */}
            {order.status === 'REJECTED' && (
              <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-6">
                <div className="flex gap-4">
                  <AlertCircle size={24} className="text-red-400 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-red-400 mb-2">Commande Rejetée</h3>
                    <p className="text-red-300">
                      Désolé, votre commande a été rejetée par la boutique. Veuillez contacter le vendeur pour plus d'informations.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Delivery Information */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-4">Informations de Livraison</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Mode</p>
                  <p className="font-semibold flex items-center gap-2">
                    {order.deliveryType === 'PICKUP' ? (
                      <>
                        <MapPin size={18} className="text-blue-400" />
                        Retrait en boutique
                      </>
                    ) : (
                      <>
                        <Truck size={18} className="text-green-400" />
                        Livraison à domicile
                      </>
                    )}
                  </p>
                </div>

                {order.deliveryType === 'PICKUP' && order.pickupTime && (
                  <div>
                    <p className="text-gray-400 text-sm mb-1">Heure de Retrait</p>
                    <p className="font-semibold">
                      {new Date(order.pickupTime).toLocaleString('fr-FR')}
                    </p>
                  </div>
                )}

                {order.deliveryType === 'DELIVERY' && order.deliveryAddress && (
                  <div>
                    <p className="text-gray-400 text-sm mb-1">Adresse de Livraison</p>
                    <p className="font-semibold">
                      {order.deliveryAddress}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Customer Information */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-4">Vos Informations</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Nom</p>
                  <p className="font-semibold">{order.customerName}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm mb-1">Email</p>
                  <p className="font-semibold text-sm">{order.customerEmail}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm mb-1">Téléphone</p>
                  <p className="font-semibold">{order.customerPhone}</p>
                </div>
              </div>
            </div>

            {/* Order Items */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-4">Articles Commandés</h2>
              <div className="space-y-3">
                {order.items && order.items.map(item => (
                  <div key={item.id} className="flex justify-between items-center bg-gray-700 p-3 rounded">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-gray-400">Quantité: {item.quantity}</p>
                    </div>
                    <p className="text-red-400 font-semibold">${(item.price / 100).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Total */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Montant Total</span>
                <span className="text-red-400 text-2xl">${(order.totalAmount / 100).toFixed(2)}</span>
              </div>
            </div>

            {/* Notes */}
            {order.notes && (
              <div className="bg-yellow-600/20 border border-yellow-600/50 rounded-lg p-4">
                <p className="text-yellow-400 text-sm mb-2 font-semibold">Notes Spéciales:</p>
                <p className="text-yellow-300">{order.notes}</p>
              </div>
            )}

            {/* New Search */}
            <div className="text-center">
              <button
                onClick={() => {
                  setSearchQuery('');
                  setOrder(null);
                  setError('');
                  setHasSearched(false);
                }}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
              >
                Rechercher une autre commande
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!order && hasSearched && !loading && !error && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">Aucune commande trouvée</p>
          </div>
        )}

        {/* Initial State */}
        {!order && !hasSearched && (
          <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-6 text-center">
            <p className="text-blue-400">
              ℹ️ Entrez votre numéro de commande (les 8 derniers caractères visibles sur la confirmation) ou votre adresse email pour suivre votre commande.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
