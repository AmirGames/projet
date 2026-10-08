/** Le `code` d'une erreur (Prisma : « P2002 », « P2025 »…), sans supposer son type. */
export function codeErreur(erreur: unknown): string | undefined {
  if (typeof erreur !== "object" || erreur === null || !("code" in erreur)) return undefined;
  return typeof erreur.code === "string" ? erreur.code : undefined;
}
