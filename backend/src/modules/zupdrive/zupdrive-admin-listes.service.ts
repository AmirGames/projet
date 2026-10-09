import { db } from "../../services/db";
import { piecesExigees } from "./chauffeur-onboarding.service";
import { NoteCourseDriveService } from "./note-course-drive.service";

type Pagination = { statut: string; limit: number; offset: number };

/** Listes de l'administration ZupDrive : dossiers chauffeurs, sociétés et courses, en lecture seule. */
export const ZupDriveAdminListesService = {
  /** Les dossiers chauffeurs, avec l'état de leurs pièces et leur note. */
  async chauffeurs(query: Pagination) {
    const where = query.statut === "ALL" ? {} : { statut: query.statut };

    const [chauffeurs, total, parStatut] = await Promise.all([
      db.chauffeurDrive.findMany({
        where,
        skip: query.offset,
        take: query.limit,
        include: {
          user: { select: { email: true } },
          documents: { where: { archiveeLe: null }, select: { type: true, statut: true } },
          societe: { select: { id: true, raisonSociale: true } },
        },
        // Les dossiers soumis depuis le plus longtemps d'abord.
        orderBy: [{ soumisLe: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      }),
      db.chauffeurDrive.count({ where }),
      db.chauffeurDrive.groupBy({ by: ["statut"], _count: true }),
    ]);
    const notes = await NoteCourseDriveService.moyennesChauffeurs(chauffeurs.map((c) => c.id));

    return {
      data: chauffeurs.map((chauffeur) => {
        const exigees = piecesExigees(chauffeur.region, { enSociete: Boolean(chauffeur.societeId) });
        const validees = new Set(
          chauffeur.documents.filter((piece) => piece.statut === "APPROVED").map((piece) => piece.type)
        );
        return {
          id: chauffeur.id,
          nomComplet: chauffeur.nomComplet,
          email: chauffeur.user.email,
          telephone: chauffeur.telephone,
          region: chauffeur.region,
          raisonSociale: chauffeur.raisonSociale,
          vehiculePlaque: chauffeur.vehiculePlaque,
          // Chauffeur d'une société : licence, assurance et véhicule sont les siens.
          societe: chauffeur.societe ?? null,
          statut: chauffeur.statut,
          motifStatut: chauffeur.motifStatut,
          soumisLe: chauffeur.soumisLe,
          valideLe: chauffeur.valideLe,
          piecesDeposees: chauffeur.documents.length,
          piecesValidees: exigees.filter((type) => validees.has(type)).length,
          piecesExigees: exigees.length,
          // Nulle tant qu'aucun passager ne l'a noté.
          note: notes.get(chauffeur.id) ?? { moyenne: null, avis: 0 },
          createdAt: chauffeur.createdAt,
        };
      }),
      counts: Object.fromEntries(parStatut.map((ligne) => [ligne.statut, ligne._count])),
      pagination: { total, limit: query.limit, offset: query.offset },
    };
  },

  /** L'adresse e-mail du compte d'un chauffeur (`null` si le compte a disparu). */
  async emailDuCompte(userId: string) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    return user?.email ?? null;
  },

  /** Les sociétés, avec leurs chauffeurs et véhicules conformes. */
  async societes(query: Pagination) {
    const where = query.statut === "ALL" ? {} : { statut: query.statut };

    const [societes, total, parStatut] = await Promise.all([
      db.societeDrive.findMany({
        where,
        skip: query.offset,
        take: query.limit,
        include: {
          gerant: { select: { email: true } },
          _count: { select: { chauffeurs: true } },
          vehicules: { where: { retireLe: null }, select: { conforme: true } },
        },
        orderBy: [{ soumisLe: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      }),
      db.societeDrive.count({ where }),
      db.societeDrive.groupBy({ by: ["statut"], _count: true }),
    ]);

    return {
      data: societes.map((societe) => ({
        id: societe.id,
        raisonSociale: societe.raisonSociale,
        numeroEntreprise: societe.numeroEntreprise,
        region: societe.region,
        telephone: societe.telephone,
        email: societe.gerant.email,
        statut: societe.statut,
        motifStatut: societe.motifStatut,
        soumisLe: societe.soumisLe,
        chauffeurs: societe._count.chauffeurs,
        vehicules: societe.vehicules.length,
        vehiculesConformes: societe.vehicules.filter((v) => v.conforme).length,
        createdAt: societe.createdAt,
      })),
      counts: Object.fromEntries(parStatut.map((ligne) => [ligne.statut, ligne._count])),
      pagination: { total, limit: query.limit, offset: query.offset },
    };
  },

  /** Les courses, les plus récentes d'abord, sans la clé d'idempotence. */
  async courses(query: Pagination) {
    const where = query.statut === "ALL" ? {} : { statut: query.statut };
    const [courses, total] = await Promise.all([
      db.courseDrive.findMany({
        where,
        skip: query.offset,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        include: {
          passager: { select: { email: true, name: true } },
          chauffeur: { select: { id: true, nomComplet: true, vehiculePlaque: true } },
          // Les commentaires ne sont lus que par l'équipe.
          notes: { select: { auteur: true, note: true, commentaire: true } },
        },
      }),
      db.courseDrive.count({ where }),
    ]);
    return {
      data: courses.map(c => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'cleIdempotence'))),
      pagination: { total, limit: query.limit, offset: query.offset },
    };
  },
};
