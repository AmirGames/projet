import * as Speech from 'expo-speech';

/**
 * La voix du guidage. La langue est « fr » et non « fr-FR » : sur Android,
 * expo-speech construit `new Locale("fr-FR")`, une langue que le moteur ne
 * reconnaît pas, et retombe alors sur la langue du téléphone.
 */
const LANGUAGE = 'fr';

/** Dit la phrase, en coupant celle qui serait encore en cours. */
export function say(text: string, onError?: () => void) {
  Speech.stop()
    .catch(() => undefined)
    .then(() => Speech.speak(text, { language: LANGUAGE, onError: onError ? () => onError() : undefined }));
}

export const silence = () => void Speech.stop().catch(() => undefined);

/**
 * Le téléphone sait-il parler français ?
 * - ok : une voix française est là ;
 * - no-french : un moteur de synthèse, mais pas de voix française ;
 * - no-engine : aucun moteur de synthèse vocale (certains Xiaomi, Huawei…).
 */
export type VoiceCheck = 'ok' | 'no-french' | 'no-engine';

export async function checkVoice(): Promise<VoiceCheck> {
  const voices = await Speech.getAvailableVoicesAsync().catch(() => []);
  // Android renvoie une liste vide quand le moteur n'a pas pu démarrer.
  if (voices.length === 0) return 'no-engine';
  return voices.some((v) => v.language?.toLowerCase().startsWith('fr')) ? 'ok' : 'no-french';
}

/** Ce qu'il faut faire, dit au livreur. */
export const VOICE_HELP: Record<VoiceCheck, string> = {
  ok: 'Vous devriez entendre « Dans 200 mètres, tournez à droite ». Rien ? Montez le volume multimédia du téléphone (pas celui de la sonnerie).',
  'no-french':
    'Aucune voix française sur ce téléphone. Réglages du téléphone › Synthèse vocale (souvent dans Langues et saisie, ou Accessibilité) : installez la voix française du moteur Google.',
  'no-engine':
    'Ce téléphone n’a pas de synthèse vocale. Installez « Services vocaux de Google » depuis le Play Store, choisissez-le dans Réglages › Synthèse vocale, puis réessayez.',
};
