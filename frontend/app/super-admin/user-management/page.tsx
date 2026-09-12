'use client';

import { useEffect, useState } from 'react';
import { Ban, Undo2, Search, AlertCircle } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  status: 'ACTIVE' | 'BANNED' | 'SUSPENDED';
  isMerchant: boolean;
  createdAt: string;
  bannedReason?: string;
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'BANNED' | 'SUSPENDED'>('ALL');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [banReason, setBanReason] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      // This would need a backend endpoint to fetch users
      // For now showing placeholder data structure
      setUsers([]);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.includes(search) || user.name.includes(search);
    const matchesFilter = filter === 'ALL' || user.status === filter;
    return matchesSearch && matchesFilter;
  });

  const handleBanUser = async (_user: User) => {
    if (!banReason.trim()) {
      setMessage('❌ Veuillez entrer une raison');
      return;
    }

    try {
      // This would call a backend endpoint to ban the user
      setMessage('✅ Utilisateur banni avec succès!');
      setBanReason('');
      setSelectedUser(null);
      setTimeout(() => setMessage(''), 3000);
      fetchUsers();
    } catch (error) {
      console.error('Erreur:', error);
      setMessage('❌ Erreur lors du bannissement');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleUnbanUser = async (_user: User) => {
    try {
      // This would call a backend endpoint to unban the user
      setMessage('✅ Utilisateur débanni avec succès!');
      setTimeout(() => setMessage(''), 3000);
      fetchUsers();
    } catch (error) {
      console.error('Erreur:', error);
      setMessage('❌ Erreur lors du débannissement');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Gestion des utilisateurs</h1>
        <p className="text-gray-400 mt-1">Bannissements et suspensions</p>
      </div>

      {/* Message */}
      {message && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          {message}
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Search size={20} className="text-gray-400" />
            <input
              type="text"
              placeholder="Chercher par email ou nom..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">Tous</option>
              <option value="ACTIVE">Actifs</option>
              <option value="BANNED">Bannies</option>
              <option value="SUSPENDED">Suspendus</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            Aucun utilisateur trouvé.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-700 border-b border-gray-600">
              <tr>
                <th className="px-6 py-4 text-left">Utilisateur</th>
                <th className="px-6 py-4 text-left">Type</th>
                <th className="px-6 py-4 text-left">Statut</th>
                <th className="px-6 py-4 text-left">Inscrit le</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs">
                      {user.isMerchant ? '🏪 Commerçant' : '👤 Client'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        user.status === 'ACTIVE'
                          ? 'bg-green-600/20 text-green-400'
                          : user.status === 'BANNED'
                          ? 'bg-red-600/20 text-red-400'
                          : 'bg-yellow-600/20 text-yellow-400'
                      }`}
                    >
                      {user.status === 'ACTIVE' && '✅ Actif'}
                      {user.status === 'BANNED' && '🚫 Banni'}
                      {user.status === 'SUSPENDED' && '⏸️ Suspendu'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400">
                    {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex gap-2 justify-end">
                      {user.status === 'ACTIVE' ? (
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                          title="Bannir l'utilisateur"
                        >
                          <Ban size={18} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUnbanUser(user)}
                          className="text-green-400 hover:text-green-300 transition-colors"
                          title="Débannir l'utilisateur"
                        >
                          <Undo2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Ban Modal */}
      {selectedUser && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle size={24} className="text-red-500 mt-1" />
            <div>
              <h3 className="text-lg font-bold">Bannir l'utilisateur?</h3>
              <p className="text-gray-400 text-sm mt-1">
                Êtes-vous sûr de vouloir bannir <strong>{selectedUser.name}</strong>?
              </p>
            </div>
          </div>

          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2">Raison du bannissement</label>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Expliquez pourquoi cet utilisateur est banni..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-red-500"
                rows={3}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setSelectedUser(null);
                setBanReason('');
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => handleBanUser(selectedUser)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
            >
              Confirmer le bannissement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
