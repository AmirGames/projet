/**
 * Les rapports de violation de la CSP, ramenés au format de
 * /api/monitoring/client-errors.
 *
 * Deux formats arrivent selon le navigateur :
 * - `report-uri` (application/csp-report) : { "csp-report": { … } } ;
 * - Reporting API (application/reports+json) : [{ type: "csp-violation", body }].
 *
 * Tout est non fiable : n'importe qui peut poster ici. Seuls des textes bornés
 * sont gardés, et jamais la requête (query) des adresses, qui peut porter un
 * jeton (suivi de commande, réinitialisation de mot de passe).
 */

export interface ViolationCsp {
  message: string;
  page: string;
  source?: string;
}

const EXTENSIONS = /^(chrome|moz|safari|safari-web|edge)-extension:/i;

const texte = (valeur: unknown, max: number): string | undefined =>
  typeof valeur === 'string' && valeur.trim() ? valeur.trim().slice(0, max) : undefined;

/** Chemin d'une adresse, sans requête ni fragment. */
function cheminSeul(adresse: unknown): string | undefined {
  const brut = texte(adresse, 2000);
  if (!brut) return undefined;
  try {
    return new URL(brut).pathname.slice(0, 300);
  } catch {
    return undefined;
  }
}

/** Origine + chemin d'une ressource bloquée ; les mots-clés (inline, eval, data) restent tels quels. */
function ressource(adresse: unknown): string | undefined {
  const brut = texte(adresse, 2000);
  if (!brut) return undefined;
  if (/^(inline|eval|wasm-eval|trusted-types-policy|trusted-types-sink|self)$/i.test(brut)) return brut.toLowerCase();
  try {
    const url = new URL(brut);
    if (url.protocol === 'data:' || url.protocol === 'blob:') return url.protocol;
    return `${url.origin}${url.pathname}`.slice(0, 300);
  } catch {
    return brut.slice(0, 100);
  }
}

function normaliser(champs: Record<string, unknown>): ViolationCsp | null {
  const directive = texte(champs['effective-directive'] ?? champs.effectiveDirective ?? champs['violated-directive'] ?? champs.violatedDirective, 80);
  const bloque = texte(champs['blocked-uri'] ?? champs.blockedURL ?? champs.blockedUri, 2000);
  const source = texte(champs['source-file'] ?? champs.sourceFile, 2000);
  const document = champs['document-uri'] ?? champs.documentURL ?? champs.documentUri;

  if (!directive) return null;
  // Les extensions du navigateur injectent des scripts : ce n'est pas le site.
  if ((bloque && EXTENSIONS.test(bloque)) || (source && EXTENSIONS.test(source))) return null;

  const observation = String(champs.disposition ?? 'report') === 'enforce' ? 'bloqué' : 'observé';
  return {
    message: `CSP ${directive} ${observation} : ${ressource(bloque) ?? 'inconnu'}`.slice(0, 500),
    page: cheminSeul(document) ?? '/',
    source: source ? ressource(source) : undefined,
  };
}

/** Les violations d'un corps de rapport, vide si le corps n'en est pas un. */
export function violationsDuCorps(corps: unknown): ViolationCsp[] {
  const bruts: unknown[] = [];

  if (Array.isArray(corps)) {
    for (const rapport of corps.slice(0, 10)) {
      if (rapport && typeof rapport === 'object' && (rapport as any).type === 'csp-violation') {
        bruts.push((rapport as any).body);
      }
    }
  } else if (corps && typeof corps === 'object') {
    bruts.push((corps as any)['csp-report']);
  }

  return bruts
    .filter((brut): brut is Record<string, unknown> => !!brut && typeof brut === 'object')
    .map(normaliser)
    .filter((v): v is ViolationCsp => v !== null);
}
