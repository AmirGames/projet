import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Assez pour lire une étiquette ou une pièce d'identité, sans plus. */
const MAX_SIDE = 1600;

/**
 * Réduit une photo avant l'envoi.
 *
 * Celle d'un téléphone récent pèse plusieurs mégaoctets, jusqu'à dépasser les
 * 10 Mo que le serveur accepte : l'envoi échouait devant la porte du client,
 * sur le réseau mobile. Réduite à 1600 px de côté en JPEG, elle en pèse
 * quelques centaines de Ko.
 *
 * En cas d'échec, la photo d'origine part telle quelle : mieux vaut un envoi
 * lent qu'aucun envoi.
 */
export async function reducePhoto(photo: { uri: string; width?: number; height?: number }) {
  try {
    const context = ImageManipulator.manipulate(photo.uri);
    const { width = 0, height = 0 } = photo;
    if (Math.max(width, height) > MAX_SIDE) {
      context.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    }
    const image = await context.renderAsync();
    const result = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    return { uri: result.uri, type: 'image/jpeg' as const, name: 'photo.jpg' };
  } catch (e) {
    console.warn('Réduction de la photo impossible', e);
    return { uri: photo.uri, type: 'image/jpeg' as const, name: 'photo.jpg' };
  }
}
