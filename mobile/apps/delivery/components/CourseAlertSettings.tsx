import React, { useEffect, useState } from 'react';
import { AppState, Platform, Switch, Text, TouchableOpacity, View } from 'react-native';
import { CourseAlerts } from '../lib/courseAlerts';
import type { Prefs } from '../lib/session';
import type { CourseAlertStatus } from '../modules/course-alerts/src/CourseAlertsModule';
import { COLORS, themedStyles } from './ui';

export default function CourseAlertSettings({ prefs, onChange }: { prefs: Prefs; onChange: (patch: Partial<Prefs>) => void }) {
  const [status, setStatus] = useState<CourseAlertStatus | null>(() => CourseAlerts?.getStatus() ?? null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') setStatus(CourseAlerts?.getStatus() ?? null);
    });
    return () => sub.remove();
  }, []);
  if (Platform.OS !== 'android') return null;
  if (!CourseAlerts) return <Text style={styles.help}>Installez le nouvel APK pour les alertes sur l’écran verrouillé et la sonnerie en silencieux.</Text>;
  const alerts = CourseAlerts;
  const fail = () => setMessage('Ce réglage n’a pas pu être ouvert. Réessayez dans les paramètres du téléphone.');
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.description}>
          <Text style={styles.label}>Fenêtre Nouvelle course</Text>
          <Text style={styles.help}>Affiche la proposition sur les autres applications et l’écran verrouillé, avec Accepter et Refuser.</Text>
        </View>
        <Switch value={prefs.coursePopupEnabled} trackColor={{ true: COLORS.success, false: COLORS.raised }}
          onValueChange={enabled => {
            onChange({ coursePopupEnabled: enabled });
            if (enabled && !status?.overlayGranted) alerts.openOverlaySettings().catch(fail);
          }} />
      </View>
      {prefs.coursePopupEnabled && (
        <>
          <Text style={[styles.help, { color: status?.overlayGranted ? COLORS.successText : COLORS.warning }]}>
            {status?.overlayGranted ? '✓ Affichage au-dessus des autres applications autorisé' : 'Autorisation d’affichage nécessaire sur ce téléphone.'}
          </Text>
          {!status?.overlayGranted && <TouchableOpacity style={styles.button} onPress={() => alerts.openOverlaySettings().catch(fail)}>
            <Text style={styles.buttonText}>Autoriser l’affichage</Text>
          </TouchableOpacity>}
        </>
      )}
      <View style={styles.row}>
        <View style={styles.description}>
          <Text style={styles.label}>Sonner même en silencieux</Text>
          <Text style={styles.help}>Utilise le volume des alarmes pour les nouvelles courses. Le mode silencieux du téléphone reste inchangé.</Text>
        </View>
        <Switch value={prefs.ringInSilentMode} disabled={!prefs.soundEnabled} trackColor={{ true: COLORS.success, false: COLORS.raised }}
          onValueChange={ringInSilentMode => onChange({ ringInSilentMode })} />
      </View>
      {prefs.ringInSilentMode && (
        <>
          <Text style={styles.help}>Volume des alarmes : {status?.alarmVolume ?? '—'} / {status?.alarmVolumeMax ?? '—'}. À zéro, aucun son ne sera entendu.</Text>
          <Text style={styles.help}>{status?.doNotDisturb ? '« Ne pas déranger » est actif : vérifiez que les alarmes sont autorisées.' : '« Ne pas déranger » peut également couper les alarmes selon ses réglages.'}</Text>
          <TouchableOpacity style={styles.button} onPress={() => alerts.openSoundSettings().catch(fail)}>
            <Text style={styles.buttonText}>Régler le volume des alarmes</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity style={styles.button} disabled={!prefs.coursePopupEnabled || !status?.overlayGranted}
        onPress={() => {
          alerts.testInFiveSeconds().then(() => setMessage('Test prévu dans 5 secondes : quittez l’application ou verrouillez le téléphone. Aucune vraie course ne sera prise.')).catch(fail);
        }}>
        <Text style={[styles.buttonText, (!prefs.coursePopupEnabled || !status?.overlayGranted) && { color: COLORS.muted }]}>Tester la fenêtre dans 5 s</Text>
      </TouchableOpacity>
      {!!message && <Text style={styles.help}>{message}</Text>}
    </View>
  );
}

const styles = themedStyles(() => ({
  container: { marginTop: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  description: { flex: 1, marginRight: 12 },
  label: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  help: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  button: { borderRadius: 10, backgroundColor: COLORS.raised, padding: 12, alignItems: 'center' },
  buttonText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
}));
