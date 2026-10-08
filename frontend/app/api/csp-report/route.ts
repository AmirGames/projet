import { NextRequest, NextResponse } from 'next/server';
import { violationsDuCorps } from '@/lib/rapport-csp';

/**
 * Reçoit les violations de la Content-Security-Policy (report-uri) et les
 * transmet à /api/monitoring/client-errors, catégorie `csp` : listées dans la
 * page Monitoring sans compter comme des pannes (voir surveillance.service.ts).
 *
 * Ouvert à tous par nature (le navigateur ne s'authentifie pas pour rapporter),
 * donc : corps borné, doublons écartés, jamais d'erreur renvoyée, et l'adresse
 * du visiteur transmise pour que la limite par IP de l'API le vise lui.
 *
 * POST /api/csp-report — sans authentification ; Content-Type
 * application/csp-report | application/reports+json | application/json ;
 * réponse 204 dans tous les cas.
 */
export const dynamic = 'force-dynamic';

const API_INTERNE = () =>
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const TAILLE_MAX = 16 * 1024;
/** Une même violation n'est retransmise qu'une fois par fenêtre. */
const FENETRE_MS = 5 * 60 * 1000;
const DEJA_VUES_MAX = 500;
const dejaVues = new Map<string, number>();

function nouvelle(cle: string): boolean {
  const maintenant = Date.now();
  const vue = dejaVues.get(cle);
  if (vue && maintenant - vue < FENETRE_MS) return false;
  if (dejaVues.size >= DEJA_VUES_MAX) dejaVues.delete(dejaVues.keys().next().value as string);
  dejaVues.set(cle, maintenant);
  return true;
}

function adresseDuVisiteur(requete: NextRequest): string | undefined {
  const chaine = requete.headers.get('x-forwarded-for');
  const adresses = chaine?.split(',').map((a) => a.trim()).filter(Boolean) ?? [];
  return adresses[adresses.length - 1];
}

export async function POST(requete: NextRequest) {
  const silence = new NextResponse(null, { status: 204 });

  try {
    const declare = Number(requete.headers.get('content-length') || 0);
    if (declare > TAILLE_MAX) return silence;
    const brut = (await requete.text()).slice(0, TAILLE_MAX);
    const violations = violationsDuCorps(JSON.parse(brut));

    for (const violation of violations) {
      if (!nouvelle(`${violation.message}|${violation.page}`)) continue;

      const entetes: Record<string, string> = { 'Content-Type': 'application/json' };
      const visiteur = adresseDuVisiteur(requete);
      if (visiteur) entetes['x-forwarded-for'] = visiteur;
      const agent = requete.headers.get('user-agent');
      if (agent) entetes['user-agent'] = agent;

      // Sans attendre la réponse de l'API : un rapport ne retarde personne.
      void fetch(`${API_INTERNE().replace(/\/$/, '')}/api/monitoring/client-errors`, {
        method: 'POST',
        headers: entetes,
        body: JSON.stringify({ ...violation, categorie: 'csp' }),
      }).catch(() => {});
    }
  } catch {
    // Corps illisible : rien à signaler, et surtout pas une erreur de plus.
  }

  return silence;
}
