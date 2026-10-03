/** Express décode les paramètres et ignore la casse des noms de routes. */
export function cheminDecode(chemin: string): string {
  return chemin.split("/").map((segment) => {
    try { return decodeURIComponent(segment); }
    catch { return segment; } // Express rendra 400 pour un paramètre mal encodé.
  }).join("/");
}

/** Compare un préfixe de route, sans confondre /api/auth et /api/auth-autre. */
export function sousChemin(chemin: string, prefixe: string): boolean {
  const normalise = chemin.toLowerCase();
  return normalise === prefixe || normalise.startsWith(prefixe + "/");
}
