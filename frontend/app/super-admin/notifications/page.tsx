'use client';

import { useEffect, useState } from 'react';
import { Bell, Search, Trash2, Settings, AlertCircle, Info, CheckCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'ALERT' | 'INFO' | 'SUCCESS' | 'WARNING';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  read: boolean;
  createdAt: string;
  targetAudience: string;
  actionUrl?: string;
}

export default function NotificationsPage() {
  const t = useTranslations('superownerNotifications');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'ALERT' | 'INFO' | 'SUCCESS' | 'WARNING'>('ALL');
  const [readFilter, setReadFilter] = useState<'ALL' | 'READ' | 'UNREAD'>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'INFO' as const,
    priority: 'MEDIUM' as const,
    targetAudience: 'ADMIN',
  });

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/admin/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setNotifications(data.notifications || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('accessToken');
      await fetch(`${API_URL}/api/admin/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      });

      setFormData({ title: '', message: '', type: 'INFO', priority: 'MEDIUM', targetAudience: 'ADMIN' });
      setShowForm(false);
      fetchNotifications();
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      await fetch(`${API_URL}/api/admin/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchNotifications();
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      await fetch(`${API_URL}/api/admin/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchNotifications();
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const filteredNotifications = notifications.filter(notif => {
    const matchesSearch =
      notif.title.toLowerCase().includes(search.toLowerCase()) ||
      notif.message.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'ALL' || notif.type === typeFilter;
    const matchesRead = readFilter === 'ALL' || (readFilter === 'READ' ? notif.read : !notif.read);
    return matchesSearch && matchesType && matchesRead;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIcon = (type: string) => {
    switch (type) {
      case 'ALERT':
        return <AlertCircle size={20} className="text-red-400" />;
      case 'WARNING':
        return <AlertCircle size={20} className="text-yellow-400" />;
      case 'SUCCESS':
        return <CheckCircle size={20} className="text-green-400" />;
      default:
        return <Info size={20} className="text-blue-400" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-red-600/20 text-red-400 border-red-600/50';
      case 'HIGH':
        return 'bg-orange-600/20 text-orange-400 border-orange-600/50';
      case 'MEDIUM':
        return 'bg-yellow-600/20 text-yellow-400 border-yellow-600/50';
      default:
        return 'bg-blue-600/20 text-blue-400 border-blue-600/50';
    }
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell size={32} />
            Notifications & Alertes
          </h1>
          <p className="text-gray-400 mt-1">Gestion des alertes système et notifications</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-red-400">{unreadCount}</p>
          <p className="text-sm text-gray-400">non lus</p>
        </div>
      </div>

      {/* Create Notification Button */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-2 font-medium transition-colors"
      >
        <Settings size={20} />
        Créer une notification
      </button>

      {/* Create Notification Form */}
      {showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">Nouvelle notification</h2>
          <form onSubmit={handleSendNotification} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Titre</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Message</label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                rows={3}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="INFO">Info</option>
                  <option value="SUCCESS">Succès</option>
                  <option value="WARNING">Avertissement</option>
                  <option value="ALERT">Alerte</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Priorité</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="LOW">Basse</option>
                  <option value="MEDIUM">Moyenne</option>
                  <option value="HIGH">Haute</option>
                  <option value="CRITICAL">Critique</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Audience</label>
              <select
                value={formData.targetAudience}
                onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="ADMIN">Administrateurs</option>
                <option value="MERCHANT">Commerçants</option>
                <option value="USER">Utilisateurs</option>
                <option value="ALL">Tous</option>
              </select>
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
                Envoyer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <Search size={20} className="text-gray-400" />
            <input
              type="text"
              placeholder="Chercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Tous les types</option>
            <option value="INFO">Info</option>
            <option value="SUCCESS">Succès</option>
            <option value="WARNING">Avertissement</option>
            <option value="ALERT">Alerte</option>
          </select>

          <select
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value as any)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Tous</option>
            <option value="UNREAD">Non lus</option>
            <option value="READ">Lus</option>
          </select>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center text-gray-400">
            Aucune notification trouvée.
          </div>
        ) : (
          filteredNotifications.map((notif) => (
            <div
              key={notif.id}
              className={`border rounded-lg p-4 flex gap-4 items-start ${
                notif.read
                  ? 'bg-gray-800 border-gray-700'
                  : 'bg-gray-800/80 border-blue-600/50 shadow-lg shadow-blue-600/20'
              }`}
            >
              <div className="mt-1">{getIcon(notif.type)}</div>

              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className={`font-bold ${notif.read ? 'text-white' : 'text-blue-400'}`}>
                      {notif.title}
                    </h3>
                    <p className="text-gray-400 text-sm mt-1">{notif.message}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(notif.priority)}`}>
                    {notif.priority}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                  <span>{new Date(notif.createdAt).toLocaleString('fr-FR')}</span>
                  <span>•</span>
                  <span className="bg-gray-700 px-2 py-1 rounded">{notif.targetAudience}</span>
                  <span>•</span>
                  <span className={`font-medium ${notif.read ? 'text-gray-500' : 'text-blue-400'}`}>
                    {notif.read ? 'Lu' : 'Non lu'}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                {!notif.read && (
                  <button
                    onClick={() => handleMarkAsRead(notif.id)}
                    className="p-2 hover:bg-gray-700 rounded transition-colors"
                    title="Marquer comme lu"
                  >
                    <CheckCircle size={18} className="text-green-400" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(notif.id)}
                  className="p-2 hover:bg-gray-700 rounded transition-colors text-red-400 hover:text-red-300"
                  title={t('delete')}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="text-gray-400 text-sm">
        Total: <strong>{filteredNotifications.length}</strong> notification(s) • Non lus: <strong>{unreadCount}</strong>
      </div>
    </div>
  );
}
