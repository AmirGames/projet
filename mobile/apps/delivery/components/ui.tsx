import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';

export type ThemeName = 'dark' | 'light';

/**
 * Thème sombre. Le noir pur éteint les pixels des écrans OLED, la majorité
 * des téléphones : le livreur garde l'écran allumé des heures, souvent la
 * nuit. Les contrastes restent lisibles en plein soleil.
 */
const DARK_COLORS = {
  /** Fonds de boutons et d'accents, sous du texte blanc. */
  primary: '#0A6CD6',
  /** Liens et textes d'accent. */
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
  /** Vert des textes (montants, « validé »). */
  successText: '#4ADE80',
  warning: '#F5B942',
  /** Fonds teintés des bandeaux d'alerte, et leur texte. */
  successBg: '#0F2A18',
  successOnBg: '#7EE2A0',
  dangerBg: '#2E1412',
  warningBg: '#2E2410',
  infoBg: '#0E2239',
  /** En-têtes des écrans, et le texte posé dessus. */
  header: '#15181C',
  onHeader: '#FFFFFF',
  /** Fond derrière la barre d'état et de l'écran de connexion. */
  chrome: '#000',
  loginButton: '#0A6CD6',
};

/** Thème clair : les couleurs d'origine de l'application, en-têtes bleus. */
const LIGHT_COLORS: typeof DARK_COLORS = {
  primary: '#007AFF',
  link: '#0066D6',
  bg: '#f5f5f5',
  card: '#fff',
  raised: '#f0f1f3',
  text: '#1F2328',
  secondary: '#57606A',
  muted: '#80878F',
  border: '#e6e8eb',
  danger: '#D93025',
  success: '#2E7D32',
  successText: '#1A7F37',
  warning: '#B26A00',
  successBg: '#E8F5E9',
  successOnBg: '#1B5E20',
  dangerBg: '#FDECEA',
  warningBg: '#FFF4E5',
  infoBg: '#EAF3FF',
  header: '#007AFF',
  onHeader: '#FFFFFF',
  chrome: '#007AFF',
  loginButton: '#0055CC',
};

/**
 * Les couleurs du thème en cours. L'objet reste le même et change de
 * contenu : les écrans le lisent à chaque rendu.
 */
export const COLORS = { ...DARK_COLORS };

let currentTheme: ThemeName = 'dark';
let themeVersion = 0;

export function applyTheme(theme: ThemeName) {
  if (theme === currentTheme) return;
  currentTheme = theme;
  themeVersion++;
  Object.assign(COLORS, theme === 'dark' ? DARK_COLORS : LIGHT_COLORS);
}

export const isDarkTheme = () => currentTheme === 'dark';

/**
 * Comme StyleSheet.create, mais les styles sont recalculés quand le thème
 * change : ils lisent COLORS au moment où on s'en sert, pas au chargement du
 * fichier.
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(factory: () => T): T {
  let cache: T | null = null;
  let builtFor = -1;
  const current = () => {
    if (!cache || builtFor !== themeVersion) {
      cache = StyleSheet.create(factory());
      builtFor = themeVersion;
    }
    return cache;
  };
  return new Proxy({} as T, { get: (_target, key) => (current() as any)[key] });
}

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

export const ui = themedStyles(() => ({
  header: {
    backgroundColor: COLORS.header,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  back: { marginRight: 12, paddingVertical: 4, paddingRight: 8 },
  backText: { color: COLORS.onHeader, fontSize: 22, fontWeight: '600' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.onHeader },
  headerSubtitle: { fontSize: 11, color: COLORS.onHeader, opacity: 0.75, marginTop: 2 },
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
}));
