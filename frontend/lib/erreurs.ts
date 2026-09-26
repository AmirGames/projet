/**
 * Le navigateur quitte-t-il la page ?
 *
 * Les requêtes encore en cours y sont coupées et rejettent avec
 * « Failed to fetch » sans que rien n'ait échoué : le visiteur est simplement
 * parti. `pageshow` remet l'indicateur à faux au retour par « Précédent »
 * (page restaurée depuis le cache).
 *
 * Sans directive « use client » : ce module sert aussi côté serveur, où
 * l'on ne quitte jamais la page.
 */
let departEnCours = false;

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    departEnCours = true;
  });
  window.addEventListener('pageshow', () => {
    departEnCours = false;
  });
}

export function quitteLaPage(): boolean {
  return departEnCours;
}

/**
 * Consigne une erreur, comme console.error — sauf quand le navigateur quitte
 * la page : un chargement coupé par le départ du visiteur n'est pas une
 * panne, et le consigner faisait croire à des erreurs qui n'existaient pas.
 */
export function signalerErreur(...details: unknown[]): void {
  if (quitteLaPage()) return;
  console.error(...details);
}

/**
 * Vérifie si une erreur vient d'une défaillance réseau.
 */
export function estErreurReseau(erreur: unknown): boolean {
  if (erreur instanceof TypeError) {
    const message = erreur.message.toLowerCase();
    return message.includes('failed to fetch') ||
           message.includes('network') ||
           message.includes('connection') ||
           message.includes('timeout');
  }
  return false;
}
