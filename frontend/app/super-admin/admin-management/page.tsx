'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Admin {
  id: string;
  email: string;
  name: string;
  isSystemAdmin: boolean;
  createdAt: string;
}

export default function AdminManagementPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
  });

  const fetchAdmins = async () => {
    try {
      // This would need a backend endpoint to fetch admins
      // For now, we'll show a placeholder
      setAdmins([]);
    } catch (error) {
      signalerErreur('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffectChargement(() => {
    fetchAdmins();
  }, []);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          confirmPassword: formData.password,
        }),
      });

      if (!response.ok) throw new Error('Failed to create admin');

      setMessage('✅ Admin ajouté avec succès!');
      setFormData({ email: '', name: '', password: '' });
      setShowForm(false);
      setTimeout(() => setMessage(''), 3000);
      fetchAdmins();
    } catch (error) {
      signalerErreur('Erreur:', error);
      setMessage('❌ Erreur lors de la création');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestion des admins</h1>
          <p className="text-gray-400 mt-1">Super administrateurs du système</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-2 font-medium transition-colors"
        >
          <Plus size={20} />
          Ajouter un admin
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          {message}
        </div>
      )}

      {/* Add Admin Form */}
      {showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">Nouvel administrateur</h2>
          <form onSubmit={handleAddAdmin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Nom</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Mot de passe</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
              >
                Créer admin
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admins List */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        {admins.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            Aucun administrateur trouvé. Créez le premier!
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-700 border-b border-gray-600">
              <tr>
                <th className="px-6 py-4 text-left">Nom</th>
                <th className="px-6 py-4 text-left">Email</th>
                <th className="px-6 py-4 text-left">Créé le</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                  <td className="px-6 py-4 font-medium">{admin.name}</td>
                  <td className="px-6 py-4 text-gray-400">{admin.email}</td>
                  <td className="px-6 py-4 text-gray-400">
                    {new Date(admin.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-red-400 hover:text-red-300 transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info */}
      <div className="bg-yellow-600/20 border border-yellow-600/50 rounded-lg p-4">
        <p className="text-yellow-400 text-sm">
          ⚠️ Les super administrateurs ont accès à tous les paramètres du système.
          À utiliser avec prudence!
        </p>
      </div>
    </div>
  );
}
