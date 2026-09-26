import type * as DocumentPickerModule from 'expo-document-picker';

/** Le plafond du serveur : au-delà, l'envoi serait refusé après le transfert. */
const MAX_SIZE = 10 * 1024 * 1024;

/**
 * Chargé à la demande, comme expo-image-manipulator : une application compilée
 * avant son ajout ne l'a pas, et l'importer en tête de fichier ferait planter
 * l'écran du compte.
 */
let cached: typeof DocumentPickerModule | null | undefined;
function documentPicker(): typeof DocumentPickerModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = require('expo-document-picker') as typeof DocumentPickerModule;
  } catch (e) {
    console.warn('expo-document-picker indisponible : recompilez l’application (expo run:android)', e);
    cached = null;
  }
  return cached;
}

/**
 * Choisit un PDF dans les fichiers du téléphone.
 *
 * La galerie ne montre que les photos : une attestation d'assurance reçue par
 * e-mail, en PDF, ne pouvait pas être déposée.
 *
 * Renvoie `null` si le livreur annule ; lève une erreur lisible sinon.
 */
export async function pickPdf(): Promise<{ uri: string; type: string; name: string } | null> {
  const picker = documentPicker();
  if (!picker) {
    throw new Error("Le choix de fichiers n'est pas disponible dans cette version de l'application.");
  }

  const result = await picker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  if (asset.size && asset.size > MAX_SIZE) {
    throw new Error('Ce fichier dépasse 10 Mo.');
  }

  return {
    uri: asset.uri,
    type: asset.mimeType || 'application/pdf',
    name: asset.name || 'document.pdf',
  };
}
