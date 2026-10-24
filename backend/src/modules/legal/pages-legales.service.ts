import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { PAGES_LEGALES_DEFAUT, SLUGS_LEGAUX, VERSION_INITIALE, type SlugLegal } from "../../contenus/pages-legales.defaut";

export type PageLegale = {
  slug: SlugLegal;
  titre: string;
  contenu: string;
  version: string;
  publieLe: Date | null;
  /** Vrai tant qu'aucune version n'a été publiée : c'est le texte de départ. */
  parDefaut: boolean;
};

/** Les crochets des liens Markdown sont suivis de « ( » ; les autres désignent un champ à compléter. */
export const contientChampLegalACompleter = (contenu: string) => /\[[^\]\n]+\](?!\()/.test(contenu);

const contientAvertissementDeBrouillon = (contenu: string) =>
  /\bprojet (?:de |d['’])?(?:conditions|notice|déclaration|document)|\bprojet à compléter\b|\bà (?:définir|confirmer|documenter|valider)\b/i.test(contenu);

export const estPageLegalePrete = (page: PageLegale) =>
  !page.parDefaut &&
  !contientChampLegalACompleter(page.contenu) &&
  !contientAvertissementDeBrouillon(page.contenu);

/** Ces pages doivent être publiées avant de permettre une commande en production. */
const PAGES_REQUISES_COMMANDE: SlugLegal[] = ["mentions-legales", "cgu", "cgv", "confidentialite", "cookies"];

function estSlugLegal(slug: string): slug is SlugLegal {
  return (SLUGS_LEGAUX as readonly string[]).includes(slug);
}

function verifierSlug(slug: string): SlugLegal {
  if (!estSlugLegal(slug)) throw new ApiError(404, "Page légale inconnue", "NOT_FOUND");
  return slug;
}

export const PagesLegalesService = {
  /** La version en vigueur : la dernière publiée, sinon le texte de départ. */
  async enVigueur(slugBrut: string): Promise<PageLegale> {
    const slug = verifierSlug(slugBrut);
    const derniere = await db.pageLegaleVersion.findFirst({ where: { slug }, orderBy: { publieLe: "desc" } });
    if (derniere) {
      return { slug, titre: derniere.titre, contenu: derniere.contenu, version: derniere.version, publieLe: derniere.publieLe, parDefaut: false };
    }
    return { slug, ...PAGES_LEGALES_DEFAUT[slug], version: VERSION_INITIALE, publieLe: null, parDefaut: true };
  },

  async toutes(): Promise<PageLegale[]> {
    return Promise.all(SLUGS_LEGAUX.map((slug) => this.enVigueur(slug)));
  },

  /** Les versions publiées d'une page, la plus récente d'abord. */
  async historique(slugBrut: string) {
    const slug = verifierSlug(slugBrut);
    return db.pageLegaleVersion.findMany({ where: { slug }, orderBy: { publieLe: "desc" } });
  },

  /**
   * Publie une nouvelle version. Une version publiée ne se réécrit jamais :
   * c'est ce texte-là que des personnes ont accepté.
   */
  async publier(slugBrut: string, donnees: { titre: string; contenu: string; version: string }, auteur?: string) {
    const slug = verifierSlug(slugBrut);
    if (contientChampLegalACompleter(donnees.contenu) || contientAvertissementDeBrouillon(donnees.contenu)) {
      throw new ApiError(422, "Complétez les champs et retirez l'avertissement de brouillon avant publication", "LEGAL_DRAFT");
    }
    const version = donnees.version.trim();
    const actuelle = await this.enVigueur(slug);
    const dejaPrise =
      (actuelle.parDefaut && version === VERSION_INITIALE) ||
      (await db.pageLegaleVersion.findUnique({ where: { slug_version: { slug, version } } }));
    if (dejaPrise) {
      throw new ApiError(409, `La version « ${version} » existe déjà pour cette page : choisissez un nouveau numéro`, "VERSION_EXISTS");
    }
    return db.pageLegaleVersion.create({
      data: { slug, version, titre: donnees.titre.trim(), contenu: donnees.contenu, publiePar: auteur ?? null },
    });
  },

  /** « cgu@2026-09-25 cgv@v2 » : les versions en vigueur des documents acceptés. */
  async versionsDe(slugs: string[]): Promise<string> {
    const pages = await Promise.all(slugs.map((slug) => this.enVigueur(slug)));
    return pages.map((page) => `${page.slug}@${page.version}`).join(" ");
  },

  async verifierPrealablesCommande(): Promise<void> {
    const pages = await Promise.all(PAGES_REQUISES_COMMANDE.map((slug) => this.enVigueur(slug)));
    const manquantes = pages.filter((page) => !estPageLegalePrete(page)).map((page) => page.slug);
    if (manquantes.length) {
      throw new ApiError(503, `Commandes indisponibles : pages légales à publier (${manquantes.join(", ")})`, "LEGAL_PAGES_NOT_READY");
    }
  },
};
