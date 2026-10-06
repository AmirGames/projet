import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';
import http from 'node:http';
import { ApiError } from '../../middleware/errorHandler';

/** Liste conservatrice : les destinations non publiques ne sont pas des webhooks. */
export function adressePublique(adresse: string): boolean {
  if (isIP(adresse) === 4) {
    const [a, b, c] = adresse.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 2))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(adresse) === 6) {
    const normalisee = new URL(`http://[${adresse}]/`).hostname.toLowerCase();
    // Global unicast uniquement ; exclut aussi mapped IPv4, ULA, link-local,
    // documentation et les mécanismes de transition IPv4.
    return /^\[[23][0-9a-f]{3}:/.test(normalisee) &&
      !normalisee.startsWith('[2001:db8:') &&
      !normalisee.startsWith('[2002:') && !normalisee.startsWith('[2001:0:') && !normalisee.startsWith('[2001::');
  }
  return false;
}

function urlDestination(brut: string) {
  let url: URL;
  try { url = new URL(brut); } catch { throw refus(); }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  // Uniquement le récepteur local des vérifications hors production.
  const local = process.env.NODE_ENV !== 'production' &&
    ['127.0.0.1', '::1', 'localhost'].includes(hostname);
  if (url.username || url.password || url.hash ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw refus();
  return { url, hostname, local };
}
const refus = () => new ApiError(400, 'Le webhook doit cibler une adresse HTTPS publique.', 'WEBHOOK_DESTINATION_FORBIDDEN');

export async function destinationWebhook(brut: string) {
  const destination = urlDestination(brut);
  const ip = isIP(destination.hostname);
  let timer: NodeJS.Timeout | undefined;
  const adresses = ip ? [{ address: destination.hostname, family: ip }] :
    await Promise.race([
      lookup(destination.hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Webhook DNS timeout')), 5000); }),
    ]).finally(() => clearTimeout(timer));
  if (!adresses.length || adresses.some(({ address }) =>
    !adressePublique(address) && !(destination.local && ['127.0.0.1', '::1'].includes(address)))) throw refus();
  return { ...destination, adresse: adresses[0] };
}

/** Résout à chaque tentative, puis épingle l'adresse : aucun deuxième DNS
 * et aucune redirection ne peuvent transformer un hôte public en cible privée.
 */
export async function posterWebhook(brut: string, headers: Record<string, string>, corps: string) {
  const { url, adresse } = await destinationWebhook(brut);
  return new Promise<{ status: number; ok: boolean }>((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const requete = transport.request(url, {
      method: 'POST', headers, agent: false, family: adresse.family,
      lookup: (_hostname, _options, callback) => callback(null, adresse.address, adresse.family),
    }, (reponse) => {
      const status = reponse.statusCode || 0;
      // Le corps n'est ni utile ni conservé ; pas de téléchargement illimité.
      reponse.destroy();
      resolve({ status, ok: status >= 200 && status < 300 });
    });
    const timer = setTimeout(() => requete.destroy(new Error('Webhook timeout')), 5000);
    requete.once('error', reject);
    requete.once('close', () => clearTimeout(timer));
    requete.end(corps);
  });
}
