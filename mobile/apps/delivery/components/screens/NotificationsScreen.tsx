import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch } from '../../lib/api';
import { COLORS, ErrorBox, Loading, ScreenHeader } from '../ui';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

export default function NotificationsScreen({
  token,
  refreshKey,
  onBack,
  onUnreadChange,
}: {
  token: string;
  refreshKey: number;
  onBack: () => void;
  onUnreadChange: (count: number) => void;
}) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch<{ data: AppNotification[]; unreadCount: number }>('/api/notifications?limit=50', token);
      setItems(res.data || []);
      onUnreadChange(res.unreadCount || 0);
    } catch (e: any) {
      setError(e.message || 'Impossible de charger les notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, onUnreadChange]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const markRead = async (n: AppNotification) => {
    if (!n.isRead) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      onUnreadChange(Math.max(0, items.filter((x) => !x.isRead).length - 1));
      apiFetch(`/api/notifications/${n.id}/read`, token, { method: 'PATCH' }).catch(() => undefined);
    }
  };

  const markAll = async () => {
    setItems((list) => list.map((x) => ({ ...x, isRead: true })));
    onUnreadChange(0);
    apiFetch('/api/notifications/read-all', token, { method: 'PATCH' }).catch(() => undefined);
  };

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Notifications 🔔" subtitle={unread ? `${unread} non lue${unread > 1 ? 's' : ''}` : undefined} onBack={onBack} />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListHeaderComponent={
            unread ? (
              <TouchableOpacity onPress={markAll} style={styles.markAll}>
                <Text style={styles.markAllText}>Tout marquer comme lu</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>Aucune notification</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.item, !item.isRead && styles.itemUnread]} onPress={() => markRead(item)}>
              {!item.isRead && <View style={styles.dot} />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, !item.isRead && { fontWeight: '700' }]}>{item.title}</Text>
                <Text style={styles.message}>{item.message}</Text>
                <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, paddingBottom: 24 },
  markAll: { alignSelf: 'flex-end', paddingVertical: 6, marginBottom: 6 },
  markAllText: { color: COLORS.primary, fontWeight: '600', fontSize: 14 },
  item: { backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row' },
  itemUnread: { backgroundColor: '#EAF3FF' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, marginTop: 6, marginRight: 10 },
  title: { fontSize: 15, color: COLORS.text },
  message: { fontSize: 13, color: '#555', marginTop: 3, lineHeight: 18 },
  time: { fontSize: 12, color: COLORS.muted, marginTop: 6 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40 },
});
