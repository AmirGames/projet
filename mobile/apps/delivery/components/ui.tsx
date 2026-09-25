import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';

export const COLORS = {
  primary: '#007AFF',
  bg: '#f5f5f5',
  card: '#fff',
  text: '#333',
  muted: '#999',
  border: '#eee',
  danger: '#f44336',
  success: '#4CAF50',
};

export function ScreenHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <View style={ui.header}>
      {onBack && (
        <TouchableOpacity onPress={onBack} style={ui.back}>
          <Text style={ui.backText}>←</Text>
        </TouchableOpacity>
      )}
      <View style={{ flex: 1 }}>
        <Text style={ui.headerTitle}>{title}</Text>
        {subtitle ? <Text style={ui.headerSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={ui.card}>
      {title ? <Text style={ui.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Row({ label, value, last }: { label: string; value?: React.ReactNode; last?: boolean }) {
  return (
    <View style={[ui.row, last && { borderBottomWidth: 0 }]}>
      <Text style={ui.rowLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={ui.rowValue}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

export function Loading() {
  return (
    <View style={ui.center}>
      <ActivityIndicator color={COLORS.primary} size="large" />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={ui.center}>
      <Text style={ui.errorText}>{message}</Text>
      <TouchableOpacity style={ui.retry} onPress={onRetry}>
        <Text style={ui.retryText}>Réessayer</Text>
      </TouchableOpacity>
    </View>
  );
}

export const ui = StyleSheet.create({
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  back: { marginRight: 12, paddingVertical: 4, paddingRight: 8 },
  backText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 11, color: '#fff', opacity: 0.8, marginTop: 2 },
  content: { padding: 12, paddingBottom: 24 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.muted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLabel: { color: '#666', fontSize: 14, flex: 1 },
  rowValue: { color: COLORS.text, fontSize: 14, fontWeight: '600', textAlign: 'right', marginLeft: 10, flexShrink: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: COLORS.danger, fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retry: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '600' },
});
