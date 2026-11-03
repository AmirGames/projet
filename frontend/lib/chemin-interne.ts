/** Accepte uniquement un chemin du site, jamais une destination externe. */
export function cheminInterne(valeur: string | string[] | undefined): string | undefined {
  if (
    typeof valeur !== 'string' ||
    !valeur.startsWith('/') ||
    valeur.startsWith('//') ||
    valeur.includes('\\') ||
    /[\u0000-\u001f]/.test(valeur)
  ) return undefined;
  return valeur;
}
