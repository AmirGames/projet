import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';

/**
 * Thème sombre de toute l'application. Le noir pur éteint les pixels des
 * écrans OLED, la majorité des téléphones : le livreur garde l'écran allumé
 * des heures, souvent la nuit. Les contrastes restent lisibles en plein soleil.
 */
export const COLORS = {
  /** Fonds de boutons et d'accents, sous du texte blanc. */
  primary: '#0A6CD6',
  /** Liens et textes d'accent, sur fond sombre. */
  link: '#4DA3FF',
  bg: '#000',
  card: '#15181C',
  /** Champs, puces, boutons secondaires : un cran au-dessus des cartes. */
  raised: '#22262C',
  text: '#ECEEF1',
  secondary: '#B4BAC2',
  muted: '#8B939D',
  border: '#2A2F36',
  danger: '#FF6B61',
  /** Fonds de boutons verts, sous du texte blanc. */
  success: '#23863F',
  /** Vert des textes (montants, « validé »), lisible sur fond sombre. */
  successText: '#4ADE80',
  warning: '#F5B942',
  /** Fonds teintés des bandeaux d'alerte. */
  successBg: '#0F2A18',
  dangerBg: '#2E1412',
  warningBg: '#2E2410',
  infoBg: '#0E2239',
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
      <ActivityIndicator color={COLORS.link} size="large" />
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
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  back: { marginRight: 12, paddingVertical: 4, paddingRight: 8 },
  backText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 11, color: COLORS.secondary, marginTop: 2 },
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
  rowLabel: { color: COLORS.secondary, fontSize: 14, flex: 1 },
  rowValue: { color: COLORS.text, fontSize: 14, fontWeight: '600', textAlign: 'right', marginLeft: 10, flexShrink: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: COLORS.danger, fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retry: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '600' },
});
