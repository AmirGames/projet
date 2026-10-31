import { db } from "../../services/db";
import { objetJson } from "../../utils/json";

export const CHAMPS_PROFIL_LEGAL = [
  "nom",
  "raison_sociale",
  "forme_juridique",
  "adresse",
  "numero_bce",
  "numero_tva",
  "capital_social",
  "dirigeant",
  "telephone",
  "email",
  "mediateur",
  "site_mediation",
  "hebergeur",
  "adresse_hebergeur",
] as const;

export type ProfilLegal = Record<(typeof CHAMPS_PROFIL_LEGAL)[number], string>;

const PROFIL_VIDE = Object.fromEntries(CHAMPS_PROFIL_LEGAL.map((cle) => [cle, ""])) as ProfilLegal;

async function configSysteme() {
  let config = await db.systemConfig.findFirst();
  if (!config) config = await db.systemConfig.create({ data: {} });
  return config;
}

export async function lireProfilLegal(): Promise<ProfilLegal> {
  const config = await configSysteme();
  const settings = objetJson(config.settings);
  const profil = settings.legalCompanyProfile;
  if (!profil || typeof profil !== "object" || Array.isArray(profil)) return { ...PROFIL_VIDE };

  return Object.fromEntries(
    CHAMPS_PROFIL_LEGAL.map((cle) => [
      cle,
      typeof (profil as Record<string, unknown>)[cle] === "string"
        ? (profil as Record<string, string>)[cle]
        : "",
    ])
  ) as ProfilLegal;
}

/** Lit un instantané de profil depuis une version légale, sans faire confiance à sa forme JSON. */
export function profilLegalDepuisSnapshot(snapshot: unknown): ProfilLegal | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const valeurs = snapshot as Record<string, unknown>;
  return Object.fromEntries(
    CHAMPS_PROFIL_LEGAL.map((cle) => [cle, typeof valeurs[cle] === "string" ? valeurs[cle] : ""])
  ) as ProfilLegal;
}

export async function enregistrerProfilLegal(profil: ProfilLegal): Promise<ProfilLegal> {
  const config = await configSysteme();
  const settings = objetJson(config.settings);
  await db.systemConfig.update({
    where: { id: config.id },
    data: { settings: { ...settings, legalCompanyProfile: profil } },
  });
  return profil;
}

/** Remplace les variables $nom dans le texte au moment de la publication. */
export function remplacerVariablesLegales(texte: string, profil: ProfilLegal) {
  const variables = new Set<string>();
  const contenu = texte.replace(/\$([a-z][a-z0-9_]*)/gi, (variable, nom: string) => {
    variables.add(nom);
    if (!CHAMPS_PROFIL_LEGAL.includes(nom as (typeof CHAMPS_PROFIL_LEGAL)[number])) return variable;
    return profil[nom as keyof ProfilLegal].trim() || variable;
  });
  const manquantes = [...variables].filter(
    (nom) =>
      !CHAMPS_PROFIL_LEGAL.includes(nom as (typeof CHAMPS_PROFIL_LEGAL)[number]) ||
      !profil[nom as keyof ProfilLegal]?.trim()
  );
  return { contenu, manquantes };
}
