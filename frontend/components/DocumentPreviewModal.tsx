'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface DocumentPreviewModalProps {
  documentUrl: string;
  libelle: string;
  onClose: () => void;
}

type Apercu =
  | { etat: 'chargement' }
  | { etat: 'pret'; url: string; type: string }
  | { etat: 'erreur' };

/**
 * Le vrai type du fichier, lu dans ses premiers octets.
 *
 * Les pièces déposées avant la correction des extensions sont enregistrées en
 * `.bin` et servies en `application/octet-stream` : le navigateur, à qui l'API
 * interdit de deviner (`nosniff`), refusait de les afficher.
 */
function typeDuFichier(octets: Uint8Array, typeAnnonce: string): string {
  const egal = (attendu: number[], decalage = 0) =>
    attendu.every((octet, i) => octets[decalage + i] === octet);

  if (egal([0x25, 0x50, 0x44, 0x46])) return 'application/pdf'; // %PDF
  if (egal([0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (egal([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (egal([0x52, 0x49, 0x46, 0x46]) && egal([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (egal([0x47, 0x49, 0x46])) return 'image/gif';
  return typeAnnonce;
}

export function DocumentPreviewModal({ documentUrl, libelle, onClose }: DocumentPreviewModalProps) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Convert static upload URLs to API proxy route for proper CORS handling
  let fileUrl = documentUrl;
  if (documentUrl.includes('/uploads/')) {
    const uploadPath = documentUrl.split('/uploads/')[1];
    fileUrl = `${API_URL}/api/drivers/documents/file/${uploadPath}`;
  }

  const [apercu, setApercu] = useState<Apercu>({ etat: 'chargement' });

  // Le fichier est téléchargé puis affiché depuis une copie locale : les
  // en-têtes de sécurité de l'API (anti-cadre, même origine) ne s'appliquent
  // pas à cette copie, et l'image comme le PDF s'affichent dans la fenêtre.
  useEffect(() => {
    let annule = false;
    let urlLocale: string | null = null;

    (async () => {
      try {
        const reponse = await fetch(fileUrl);
        if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);

        const contenu = await reponse.arrayBuffer();
        const type = typeDuFichier(
          new Uint8Array(contenu),
          reponse.headers.get('content-type') || 'application/octet-stream'
        );
        urlLocale = URL.createObjectURL(new Blob([contenu], { type }));

        if (!annule) setApercu({ etat: 'pret', url: urlLocale, type });
      } catch {
        if (!annule) setApercu({ etat: 'erreur' });
      }
    })();

    return () => {
      annule = true;
      if (urlLocale) URL.revokeObjectURL(urlLocale);
    };
  }, [fileUrl]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
    >
      <div
        className="relative max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
          <h2 id="preview-title" className="text-white font-semibold">
            {libelle}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition"
            aria-label="Close preview"
          >
            <X size={20} className="text-gray-300" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-gray-900 flex items-center justify-center">
          {apercu.etat === 'chargement' && (
            <p className="p-8 text-gray-400">Chargement…</p>
          )}

          {apercu.etat === 'pret' && apercu.type === 'application/pdf' && (
            <iframe
              src={apercu.url}
              className="w-full h-[80vh] border-none"
              title={libelle}
            />
          )}

          {apercu.etat === 'pret' && apercu.type.startsWith('image/') && (
            <img
              src={apercu.url}
              alt={libelle}
              className="max-w-full max-h-[80vh] object-contain"
              onError={() => setApercu({ etat: 'erreur' })}
            />
          )}

          {(apercu.etat === 'erreur' ||
            (apercu.etat === 'pret' &&
              apercu.type !== 'application/pdf' &&
              !apercu.type.startsWith('image/'))) && (
            <div className="p-8 text-center text-gray-300">
              <p>Impossible d&apos;afficher ce fichier ici.</p>
              <a
                href={apercu.etat === 'pret' ? apercu.url : fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-blue-400 underline"
              >
                Ouvrir dans un nouvel onglet
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
