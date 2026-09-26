import { fileSystem } from './upload';

/**
 * Ce que l'application garde sur le téléphone pour tenir sans réseau : la
 * course en cours (adresses, client, articles), l'accueil, et les envois en
 * attente. Des fichiers JSON dans le dossier de l'application, effacés à la
 * déconnexion et dès qu'une course est terminée.
 *
 * Sans module de fichiers (application compilée sans lui), la mémoire seule :
 * l'application tient sans réseau tant qu'elle n'est pas fermée.
 */

const memory = new Map<string, string>();
const DIR = 'hors-connexion/';

function dir() {
  const FS = fileSystem();
  return FS?.documentDirectory ? { FS, path: FS.documentDirectory + DIR } : null;
}

let dirReady: Promise<void> | null = null;
async function ensureDir() {
  const d = dir();
  if (!d) return null;
  dirReady ??= d.FS.makeDirectoryAsync(d.path, { intermediates: true }).catch(() => undefined);
  await dirReady;
  return d;
}

const fileName = (key: string) => `${key.replace(/[^\w-]/g, '_')}.json`;

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const d = await ensureDir();
    const raw = d
      ? await d.FS.readAsStringAsync(d.path + fileName(key)).catch(() => null)
      : memory.get(key) ?? null;
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  try {
    const d = await ensureDir();
    if (d) await d.FS.writeAsStringAsync(d.path + fileName(key), raw);
    else memory.set(key, raw);
  } catch (e) {
    console.warn('Enregistrement sur le téléphone impossible', e);
  }
}

export async function removeJson(key: string) {
  memory.delete(key);
  const d = dir();
  if (d) await d.FS.deleteAsync(d.path + fileName(key), { idempotent: true }).catch(() => undefined);
}

/**
 * Garde une photo jusqu'à son envoi : celles de l'appareil photo sont dans
 * un dossier que le système peut vider. Renvoie l'adresse de la copie, ou
 * celle d'origine si la copie échoue.
 */
export async function keepFile(uri: string, name: string): Promise<string> {
  const d = await ensureDir();
  if (!d) return uri;
  const to = d.path + name;
  try {
    await d.FS.copyAsync({ from: uri, to });
    return to;
  } catch {
    return uri;
  }
}

export async function removeFile(uri: string) {
  const d = dir();
  // Seules les copies de l'application s'effacent, jamais la photo d'origine.
  if (d && uri.startsWith(d.path)) await d.FS.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

/** Déconnexion : plus rien du livreur ni de ses clients ne reste sur le téléphone. */
export async function clearOfflineStore() {
  memory.clear();
  const d = dir();
  if (d) await d.FS.deleteAsync(d.path, { idempotent: true }).catch(() => undefined);
  dirReady = null;
}
