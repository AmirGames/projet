import { useState, useEffect, useCallback } from 'react';
import { useTempsReel } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link?: string | null;
  createdAt: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/notifications?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications(data.data);
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });

      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  }, []);

  // Le serveur pousse les nouvelles notifications : sans cela il fallait
  // recharger la page pour les voir apparaître sur la cloche.
  useTempsReel<Notification>('notification', (notification) => {
    setNotifications((prev) =>
      // Une même notification peut arriver deux fois (reconnexion) : on ne
      // l'ajoute qu'une seule fois.
      prev.some((n) => n.id === notification.id)
        ? prev
        : [notification, ...prev].slice(0, 20)
    );
    setUnreadCount((prev) => prev + 1);
  });

  useEffectChargement(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    // Filet de sécurité si la connexion temps réel est coupée (proxy, réseau
    // d'entreprise) : on continue de rafraîchir, mais plus lentement.
    const interval = setInterval(fetchNotifications, 60000);

    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
