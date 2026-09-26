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

/**
 * Thème sombre de l'écran de course. Le noir pur éteint les pixels des écrans
 * OLED, la majorité des téléphones : c'est l'écran qui reste allumé le plus
 * longtemps, en plein trajet. Les contrastes restent lisibles en plein soleil.
 */
export const DARK = {
  primary: '#0A6CD6',
  link: '#4DA3FF',
  bg: '#000',
  card: '#15181C',
  raised: '#22262C',
  text: '#ECEEF1',
  secondary: '#B4BAC2',
  muted: '#8B939D',
  border: '#2A2F36',
  danger: '#FF6B61',
  success: '#23863F',
  warning: '#F5B942',
};

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  dark,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  dark?: boolean;
}) {
  return (
    <View style={[ui.header, dark && ui.headerDark]}>
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

export function Card({ title, children, dark }: { title?: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <View style={[ui.card, dark && ui.cardDark]}>
      {title ? <Text style={[ui.cardTitle, dark && { color: DARK.muted }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Row({
  label,
  value,
  last,
  dark,
}: {
  label: string;
  value?: React.ReactNode;
  last?: boolean;
  dark?: boolean;
}) {
  return (
    <View style={[ui.row, dark && { borderBottomColor: DARK.border }, last && { borderBottomWidth: 0 }]}>
      <Text style={[ui.rowLabel, dark && { color: DARK.secondary }]}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[ui.rowValue, dark && { color: DARK.text }]}>{value}</Text>
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
  headerDark: { backgroundColor: DARK.card, borderBottomWidth: 1, borderBottomColor: DARK.border },
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
  cardDark: { backgroundColor: DARK.card },
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
