import { Platform } from 'react-native';
import { API_URL } from './api';
import { reportReachable, reportUnreachable } from './network';

type FileSystemLegacy = typeof import('expo-file-system/legacy');

/** Chargé à la demande : une application compilée sans lui garde l'envoi par fetch. */
let cached: FileSystemLegacy | null | undefined;
export function fileSystem(): FileSystemLegacy | null {
  if (cached !== undefined) return cached;
  try {
    cached = Platform.OS === 'web' ? null : (require('expo-file-system/legacy') as FileSystemLegacy);
  } catch {
    cached = null;
  }
  return cached;
}

export interface UploadResult {
  status: number;
  ok: boolean;
  data: any;
}

/**
 * Envoie un fichier du téléphone au serveur, en multipart.
 *
 * Le fetch de React Native échouait sur Android (« Network request failed »)
 * pour une photo, alors que le reste de l'application joignait le serveur.
 * L'envoi passe d'abord par le module natif d'Expo, prévu pour les fichiers ;
 * fetch ne sert plus qu'en secours. Une vraie panne renvoie sa cause exacte,
 * et non « vérifiez votre connexion ».
 */
export async function uploadFile(
  path: string,
  token: string,
  file: { uri: string; type: string; name: string },
  fieldName: string,
  fields: Record<string, string> = {}
): Promise<UploadResult> {
  const url = `${API_URL}${path}`;
  const FS = fileSystem();
  let nativeError: unknown = null;

  if (FS) {
    try {
      const res = await FS.uploadAsync(url, file.uri, {
        httpMethod: 'POST',
        uploadType: FS.FileSystemUploadType.MULTIPART,
        fieldName,
        mimeType: file.type,
        parameters: fields,
        headers: { Authorization: `Bearer ${token}` },
      });
      let data: any = null;
      try {
        data = JSON.parse(res.body);
      } catch {
        // Réponse sans JSON : le statut suffit.
      }
      reportReachable();
      return { status: res.status, ok: res.status >= 200 && res.status < 300, data };
    } catch (e) {
      nativeError = e;
    }
  }

  try {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append(fieldName, file as any);
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    reportReachable();
    const data = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, data };
  } catch (e: any) {
    reportUnreachable();
    const cause = (nativeError as any)?.message || e?.message || 'erreur inconnue';
    throw new Error(`Envoi impossible vers ${API_URL} : ${cause}`);
  }
}
