import { Alert, Platform } from 'react-native';

/** Demande une confirmation avant une action grave (`Alert.alert` ne fait rien sur le web). */
export function confirmer(titre: string, message: string, libelleOui: string, surOui: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${titre}\n\n${message}`)) surOui();
    return;
  }
  Alert.alert(titre, message, [
    { text: 'Non', style: 'cancel' },
    { text: libelleOui, style: 'destructive', onPress: surOui },
  ]);
}
