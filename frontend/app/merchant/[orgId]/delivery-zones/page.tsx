'use client';

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Search, MapPin } from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';

import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface DeliveryZone {
  id: string;
  name: string;
  /** Rayon en kilomètres depuis la boutique : c'est lui qui fait la zone. */
  radiusKm: number;
  baseFee: number;
  minOrder: number;
  deliveryMinutes: number | null;
  isActive: boolean;
}

export default function DeliveryZonesPage() {

  const { storeId } = useCurrentStore();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    radiusKm: '',
    baseFee: '',
    minOrder: '',
    deliveryMinutes: '',
  });
  const [formError, setFormError] = useState('');


  useEffect(() => {
    if (storeId) {
      fetchZones();
    }
  }, [storeId]);


  const fetchZones = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/delivery-zones?storeId=${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setZones(data.zones || []);
      }
    } catch (error) {
      console.error('Error fetching delivery zones:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveZone = async () => {
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Le nom de la zone est requis');
      return;
    }

    if (!formData.baseFee) {
      setFormError('Les frais de base sont requis');
      return;
    }

    const baseFeeNum = parseFloat(formData.baseFee);
    if (baseFeeNum < 0) {
      setFormError('Les frais de base doivent être positifs');
      return;
    }

    // Sans rayon, aucune adresse ne peut être rattachée à la zone : elle ne
    // s'appliquerait jamais.
    const rayon = parseFloat(formData.radiusKm);
    if (!(rayon > 0)) {
      setFormError('Indiquez un rayon en kilomètres, supérieur à zéro');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const payload = {
        storeId,
        name: formData.name,
        radiusKm: rayon,
        baseFee: parseFloat(formData.baseFee),
        minOrder: formData.minOrder ? parseFloat(formData.minOrder) : 0,
        deliveryMinutes: formData.deliveryMinutes ? parseInt(formData.deliveryMinutes, 10) : null,
      };

      const url = editingZone
        ? `${API_URL}/api/delivery-zones/${editingZone.id}`
        : `${API_URL}/api/delivery-zones`;

      const response = await fetch(url, {
        method: editingZone ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const donnees = await response.json().catch(() => null);

      if (response.ok) {
        await fetchZones();
        setShowForm(false);
        setEditingZone(null);
        setFormData({ name: '', radiusKm: '', baseFee: '', minOrder: '', deliveryMinutes: '' });
      } else {
        // Un refus muet laissait croire que la zone était enregistrée.
        setFormError(donnees?.error || 'Enregistrement refusé');
      }
    } catch (error) {
      console.error('Error saving delivery zone:', error);
      setFormError('Le serveur ne répond pas');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteZone = async (id: string) => {
    if (!confirm('Are you sure you want to delete this delivery zone?')) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/delivery-zones/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        await fetchZones();
      }
    } catch (error) {
      console.error('Error deleting delivery zone:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleEditZone = (zone: DeliveryZone) => {
    setEditingZone(zone);
    setFormData({
      name: zone.name,
      radiusKm: zone.radiusKm?.toString() || '',
      baseFee: zone.baseFee.toString(),
      minOrder: zone.minOrder?.toString() || '',
      deliveryMinutes: zone.deliveryMinutes?.toString() || '',
    });
    setFormError('');
    setShowForm(true);
  };

  const handleAddZone = () => {
    setEditingZone(null);
    setFormData({ name: '', radiusKm: '', baseFee: '', minOrder: '', deliveryMinutes: '' });
    setFormError('');
    setShowForm(true);
  };

  const filteredZones = zones.filter(
    (zone) =>
      zone.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      zone.baseFee.toString().includes(searchTerm)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <MapPin className="text-amber-500" />
              Zones de Livraison
            </h1>
            <p className="text-slate-400 mt-2">Gérez vos zones de livraison et frais</p>
          </div>
          <button
            onClick={handleAddZone}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
          >
            <Plus size={20} />
            Ajouter Zone
          </button>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <div className="bg-slate-800 rounded-lg p-6 mb-8 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingZone ? 'Modifier Zone' : 'Nouvelle Zone de Livraison'}
            </h2>
            {formError && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4 text-red-200">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label htmlFor="zone-nom" className="text-slate-300 text-sm block mb-2">
                  Nom de la zone
                </label>
                <input
                  id="zone-nom"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ex: Centre-Ville"
                  className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                {/* Le rayon fait la zone : sans lui, aucune adresse ne peut y
                    être rattachée et la zone ne s'applique jamais. */}
                <label htmlFor="zone-rayon" className="text-slate-300 text-sm block mb-2">
                  Rayon (km)
                </label>
                <input
                  id="zone-rayon"
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={formData.radiusKm}
                  onChange={(e) => setFormData({ ...formData, radiusKm: e.target.value })}
                  placeholder="3"
                  className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="zone-frais" className="text-slate-300 text-sm block mb-2">
                  Frais de livraison (€)
                </label>
                <input
                  id="zone-frais"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.baseFee}
                  onChange={(e) => setFormData({ ...formData, baseFee: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="zone-minimum" className="text-slate-300 text-sm block mb-2">
                  Commande minimum (€)
                </label>
                <input
                  id="zone-minimum"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.minOrder}
                  onChange={(e) => setFormData({ ...formData, minOrder: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="zone-duree" className="text-slate-300 text-sm block mb-2">
                  Durée annoncée (min)
                </label>
                <input
                  id="zone-duree"
                  type="number"
                  step="5"
                  min="5"
                  value={formData.deliveryMinutes}
                  onChange={(e) => setFormData({ ...formData, deliveryMinutes: e.target.value })}
                  placeholder="30"
                  className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Les zones sont des anneaux autour de votre boutique. C'est la plus petite qui
              contient l'adresse du client qui s'applique : un voisin paie les frais de la zone
              proche, un client éloigné ceux de la zone large. Au-delà de votre plus grand rayon,
              la livraison est refusée.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSaveZone}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
              >
                {editingZone ? 'Mettre à Jour' : 'Créer'}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingZone(null);
                  setFormData({ name: '', radiusKm: '', baseFee: '', minOrder: '', deliveryMinutes: '' });
                }}
                className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher une zone..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800 text-white rounded-lg border border-slate-700 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Zones Grid */}
        {filteredZones.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredZones.map((zone) => (
              <div key={zone.id} className="bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-amber-500 transition">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white">{zone.name}</h3>
                    <p className="text-slate-400 text-sm">Zone de livraison</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditZone(zone)}
                      className="p-2 text-amber-400 hover:bg-slate-700 rounded transition"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteZone(zone.id)}
                      disabled={saving}
                      className="p-2 text-red-400 hover:bg-slate-700 rounded transition disabled:opacity-50"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Frais de Base</span>
                    <span className="text-white font-semibold">{zone.baseFee.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Commande Minimale</span>
                    <span className="text-white font-semibold">{zone.minOrder.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Rayon</span>
                    <span className="text-white font-semibold">{zone.radiusKm} km</span>
                  </div>
                  {zone.deliveryMinutes && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Durée annoncée</span>
                      <span className="text-white font-semibold">{zone.deliveryMinutes} min</span>
                    </div>
                  )}
                  <div className="text-xs pt-2 border-t border-slate-700">
                    {zone.isActive ? (
                      <span className="text-green-400">Zone livrée</span>
                    ) : (
                      <span className="text-orange-400">Zone désactivée</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <MapPin className="mx-auto text-slate-600 mb-4" size={48} />
            <p className="text-slate-400 text-lg">
              {zones.length === 0 ? 'Aucune zone de livraison' : 'Aucune zone trouvée'}
            </p>
            {zones.length === 0 && (
              <button
                onClick={handleAddZone}
                className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition inline-flex items-center gap-2"
              >
                <Plus size={20} />
                Créer votre première zone
              </button>
            )}
          </div>
        )}

        {/* Stats */}
        {zones.length > 0 && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <p className="text-slate-400 text-sm">Total des Zones</p>
              <p className="text-2xl font-bold text-white mt-1">{zones.length}</p>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <p className="text-slate-400 text-sm">Frais Moyen</p>
              <p className="text-2xl font-bold text-white mt-1">
                {euro(zones.length > 0 ? zones.reduce((sum, z) => sum + Number(z.baseFee || 0), 0) / zones.length : 0)}
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <p className="text-slate-400 text-sm">Commande Min. Max</p>
              <p className="text-2xl font-bold text-white mt-1">
                {Math.max(...zones.map((z) => z.minOrder)).toFixed(2)} €
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
