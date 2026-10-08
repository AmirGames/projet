"use client";

import { signalerErreur } from '@/lib/erreurs';
import { useState, useCallback } from "react";
import { Bell, Trash2, Check } from "lucide-react";

import { useCurrentStore } from "@/lib/current-store";
import { useTranslations } from 'next-intl';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  relatedOrderId?: string;
  relatedProductId?: string;
}

interface NotificationsResponse {
  data: Notification[];
  total: number;
  skip: number;
  take: number;
}

export default function NotificationsPage() {
  const t = useTranslations('merchantnotifications');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterRead, setFilterRead] = useState<"all" | "read" | "unread">("all");
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const { storeId } = useCurrentStore();
  const take = 20;

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const isRead =
        filterRead === "all" ? undefined : filterRead === "read" ? true : false;
      const query = new URLSearchParams({
        skip: skip.toString(),
        take: take.toString(),
        ...(isRead !== undefined && { isRead: isRead.toString() }),
      });

      const res = await fetch(`${API_URL}/api/notifications/${storeId}?${query}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!res.ok) throw new Error("Failed to fetch notifications");
      const data: NotificationsResponse = await res.json();
      setNotifications(data.data);
      setTotal(data.total);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t('erreur'));
    } finally {
      setLoading(false);
    }
  }, [filterRead, skip, storeId, t]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/notifications/${storeId}/unread/count`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch (err) {
      signalerErreur("Failed to fetch unread count:", err);
    }
  }, [storeId]);

  useEffectChargement(() => {
    if (!storeId) return;
    fetchNotifications();
    fetchUnreadCount();
  }, [filterRead, skip, storeId, fetchNotifications, fetchUnreadCount]);

  const markAsRead = async (notificationId: string) => {
    try {
      const res = await fetch(
        `${API_URL}/api/notifications/${storeId}/${notificationId}/read`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
          },
        }
      );

      if (!res.ok) throw new Error("Failed to mark as read");
      fetchNotifications();
      fetchUnreadCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('erreur'));
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch(`${API_URL}/api/notifications/${storeId}/read-all`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!res.ok) throw new Error("Failed to mark all as read");
      fetchNotifications();
      fetchUnreadCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('erreur'));
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      const res = await fetch(
        `${API_URL}/api/notifications/${storeId}/${notificationId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
          },
        }
      );

      if (!res.ok) throw new Error("Failed to delete notification");
      fetchNotifications();
      fetchUnreadCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('erreur'));
    }
  };

  const getTypeColor = (type: string) => {
    const colors: { [key: string]: string } = {
      ORDER_PLACED: "bg-blue-100 text-blue-800",
      ORDER_DELIVERED: "bg-green-100 text-green-800",
      PROMOTION_AVAILABLE: "bg-purple-100 text-purple-800",
      STOCK_LOW: "bg-yellow-100 text-yellow-800",
      REVIEW_RECEIVED: "bg-indigo-100 text-indigo-800",
      PAYMENT_FAILED: "bg-red-100 text-red-800",
      PAYMENT_SUCCEEDED: "bg-emerald-100 text-emerald-800",
    };
    return colors[type] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-8 h-8" />
            {t('titre')}
          </h1>
          <p className="text-gray-400 mt-1">
            {unreadCount} non-lues
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="bg-orange-600 text-white hover:bg-orange-700 px-4 py-2 rounded-lg"
          >
            {t('toutLu')}
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        {["all", "read", "unread"].map((filter) => (
          <button
            key={filter}
            onClick={() => {
              setFilterRead(filter as typeof filterRead);
              setSkip(0);
            }}
            className={`px-4 py-2 rounded-lg ${
              filterRead === filter
                ? "bg-gray-900 text-white"
                : "bg-gray-200 text-gray-800 hover:bg-gray-300"
            }`}
          >
            {filter === "all" && t('filterByRead')}
            {filter === "read" && t('filterByReadRead')}
            {filter === "unread" && "Non-lus"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Bell className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">{t('aucune')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-4 rounded-lg border ${
                notification.isRead
                  ? "bg-gray-50 border-gray-200"
                  : "bg-blue-50 border-blue-200"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-sm ${getTypeColor(notification.type)}`}>
                      {notification.type.replace(/_/g, " ")}
                    </span>
                    {!notification.isRead && (
                      <span className="inline-block w-2 h-2 bg-blue-600 rounded-full"></span>
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900">
                    {notification.title}
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {notification.message}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(notification.createdAt).toLocaleString("fr-FR")}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!notification.isRead && (
                    <button
                      onClick={() => markAsRead(notification.id)}
                      className="p-2 hover:bg-gray-200 rounded-lg transition"
                      title={t('mark_as_read')}
                    >
                      <Check className="w-5 h-5 text-green-600" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotification(notification.id)}
                    className="p-2 hover:bg-gray-200 rounded-lg transition"
                    title={t('delete')}
                  >
                    <Trash2 className="w-5 h-5 text-red-600" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {t("affichage", { debut: skip + 1, fin: Math.min(skip + take, total), total })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setSkip(Math.max(0, skip - take))}
            disabled={skip === 0}
            className="px-3 py-1 border rounded-lg disabled:opacity-50"
          >
            {t('precedent')}
          </button>
          <button
            onClick={() => setSkip(skip + take)}
            disabled={skip + take >= total}
            className="px-3 py-1 border rounded-lg disabled:opacity-50"
          >
            {t('suivant')}
          </button>
        </div>
      </div>
    </div>
  );
}
