import { db } from "../../services/db";

/**
 * L'identifiant du chauffeur rattaché au compte connecté, ou `null` s'il n'a
 * pas de profil chauffeur. Le chauffeur est toujours celui du jeton, jamais un
 * identifiant fourni par la requête.
 */
export async function chauffeurIdDuCompte(userId: string): Promise<string | null> {
  const chauffeur = await db.chauffeurDrive.findUnique({
    where: { userId },
    select: { id: true },
  });

  return chauffeur?.id ?? null;
}
