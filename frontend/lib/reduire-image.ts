/** Limites du serveur : 2 Mo pour une image, 5 Mo pour un PDF. */
export const TAILLE_MAX_IMAGE = 2 * 1024 * 1024;
export const TAILLE_MAX_PDF = 5 * 1024 * 1024;

/**
 * Réduit une image avant l'envoi (1600 px de côté, JPEG) : une photo de
 * téléphone pèse plusieurs mégaoctets, au-delà de la limite du serveur.
 * Un PDF ou une image illisible par le navigateur repart tel quel.
 */
export async function reduireImage(fichier: File): Promise<Blob> {
  if (!fichier.type.startsWith('image/')) return fichier;
  try {
    const image = await createImageBitmap(fichier);
    const echelle = Math.min(1, 1600 / Math.max(image.width, image.height));
    const toile = document.createElement('canvas');
    toile.width = Math.round(image.width * echelle);
    toile.height = Math.round(image.height * echelle);
    toile.getContext('2d')?.drawImage(image, 0, 0, toile.width, toile.height);
    return await new Promise<Blob>((resoudre) =>
      toile.toBlob((blob) => resoudre(blob || fichier), 'image/jpeg', 0.8)
    );
  } catch {
    return fichier;
  }
}

/**
 * Si le fichier, une fois réduit, dépasse encore la limite : la clé du message
 * dans l'espace `fichiers` des traductions ; sinon null.
 */
export function erreurDeTaille(fichier: Blob): 'pdfTropLourd' | 'imageTropLourde' | null {
  if (fichier.type === 'application/pdf' && fichier.size > TAILLE_MAX_PDF) return 'pdfTropLourd';
  if (fichier.type !== 'application/pdf' && fichier.size > TAILLE_MAX_IMAGE) return 'imageTropLourde';
  return null;
}
