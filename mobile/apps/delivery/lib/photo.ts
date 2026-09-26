import type * as ManipulatorModule from 'expo-image-manipulator';

/** Assez pour lire une étiquette ou une pièce d'identité, sans plus. */
const MAX_SIDE = 1600;

/**
 * Le module est chargé à la demande : une application compilée avant son
 * ajout ne l'a pas, et l'importer en tête de fichier faisait planter tout
 * l'écran de course (« Cannot find native module 'ExpoImageManipulator' »).
 * Sans lui, la photo part simplement sans être réduite.
 */
let cached: typeof ManipulatorModule | null | undefined;
function manipulator(): typeof ManipulatorModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = require('expo-image-manipulator') as typeof ManipulatorModule;
  } catch (e) {
    console.warn('expo-image-manipulator indisponible : recompilez l’application (expo run:android)', e);
    cached = null;
  }
  return cached;
}

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
  const original = { uri: photo.uri, type: 'image/jpeg' as const, name: 'photo.jpg' };
  const M = manipulator();
  if (!M) return original;
  try {
    const context = M.ImageManipulator.manipulate(photo.uri);
    const { width = 0, height = 0 } = photo;
    if (Math.max(width, height) > MAX_SIDE) {
      context.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    }
    const image = await context.renderAsync();
    const result = await image.saveAsync({ compress: 0.7, format: M.SaveFormat.JPEG });
    return { ...original, uri: result.uri };
  } catch (e) {
    console.warn('Réduction de la photo impossible', e);
    return original;
  }
}
