import fs from "fs/promises";
import path from "path";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { encrypt, decrypt, isEncrypted } from "../privacy/crypto";

const DOSSIER = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");

/**
 * Préfixe des vraies sauvegardes : celles de `deploy/zup.sh backup` (dump
 * PostgreSQL + fichiers), enregistrées dans la table Backup une fois chiffrées.
 * Les exports JSON de ce service portent un autre préfixe : ils ne comptent pas
 * pour le contrôle de santé « Sauvegardes ».
 */
export const PREFIXE_SAUVEGARDE_COMPLETE = "base-";

function formaterTaille(octets: number) {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`;
  if (octets < 1024 * 1024 * 1024) return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
  return `${(octets / 1024 / 1024 / 1024).toFixed(2)} Go`;
}

export class BackupService {
  static async list() {
    const [sauvegardes, total] = await Promise.all([
      db.backup.findMany({ take: 20, orderBy: { createdAt: "desc" } }),
      db.backup.count(),
    ]);

    const [utilisateurs, organisations, boutiques, produits, commandes, clients] =
      await Promise.all([
        db.user.count(),
        db.organization.count(),
        db.store.count(),
        db.product.count(),
        db.order.count(),
        db.customer.count(),
      ]);

    const derniere = sauvegardes.find((s) => s.status === "COMPLETED");

    return {
      stats: {
        totalRecords:
          utilisateurs + organisations + boutiques + produits + commandes + clients,
        databaseSize: formaterTaille(
          sauvegardes.reduce((somme, s) => somme + s.sizeBytes, 0)
        ),
        lastBackup: derniere?.completedAt || derniere?.createdAt || null,
        backupCount: total,
      },
      backups: sauvegardes.map((s) => ({
        id: s.id,
        name: s.name,
        size: formaterTaille(s.sizeBytes),
        createdAt: s.createdAt,
        status: s.status,
      })),
    };
  }

  // EXPORT PARTIEL, pas une sauvegarde : quelques tables métier en JSON chiffré
  // (organisations, boutiques, catalogue, commandes, clients, comptes sans mot de
  // passe). Ni paiements, ni relevés, ni appartenances, ni fichiers : il ne permet
  // pas de reprendre après une perte de base. La reprise passe par
  // `deploy/zup.sh backup` (pg_dump + fichiers) et `restore-test`.
  static async create(createdById?: string) {
    const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
    const nom = `export-partiel-${horodatage}.json.zupenc`;

    const enregistrement = await db.backup.create({
      data: { name: nom, createdById, status: "IN_PROGRESS" },
    });

    try {
      await fs.mkdir(DOSSIER, { recursive: true, mode: 0o700 });

      const [organisations, boutiques, produits, categories, commandes, clients, utilisateurs] =
        await Promise.all([
          db.organization.findMany(),
          db.store.findMany(),
          db.product.findMany(),
          db.category.findMany(),
          db.order.findMany({ include: { items: true } }),
          db.customer.findMany({ omit: { savedAddresses: false } }),
          db.user.findMany({
            select: { id: true, email: true, name: true, isSystemAdmin: true, isSuperOwner: true, status: true, createdAt: true },
          }),
        ]);

      const contenu = JSON.stringify(
        {
          genereLe: new Date().toISOString(),
          organisations,
          boutiques,
          produits,
          categories,
          commandes,
          clients,
          // Les empreintes de mots de passe sont volontairement exclues.
          utilisateurs,
        },
        null,
        2
      );

      const chemin = path.join(DOSSIER, nom);
      const encrypted = encrypt(contenu, `backup:${enregistrement.id}`);
      await fs.writeFile(chemin, encrypted, { encoding: "utf-8", mode: 0o600, flag: "wx" });
      const taille = Buffer.byteLength(encrypted, "utf-8");

      logger.info("Backup created", { id: enregistrement.id, taille });

      return db.backup.update({
        where: { id: enregistrement.id },
        data: {
          status: "COMPLETED",
          filePath: chemin,
          sizeBytes: taille,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Échec de la sauvegarde";
      logger.error("Backup failed", { id: enregistrement.id, error: message });

      await db.backup.update({
        where: { id: enregistrement.id },
        data: { status: "FAILED", error: message, completedAt: new Date() },
      });

      throw new ApiError(500, `Sauvegarde impossible : ${message}`, "BACKUP_FAILED");
    }
  }

  static async get(id: string) {
    const sauvegarde = await db.backup.findUnique({ where: { id } });

    if (!sauvegarde) {
      throw new ApiError(404, "Sauvegarde introuvable", "NOT_FOUND");
    }

    return sauvegarde;
  }

  // Renvoie le contenu du fichier pour téléchargement.
  static async read(id: string) {
    const sauvegarde = await this.get(id);

    if (sauvegarde.status !== "COMPLETED" || !sauvegarde.filePath) {
      throw new ApiError(400, "Cette sauvegarde n'a pas abouti", "BACKUP_INCOMPLETE");
    }

    try {
      const contenu = await fs.readFile(sauvegarde.filePath, "utf-8");
      if (!isEncrypted(contenu)) throw new Error("Migration de sauvegarde requise");
      return { nom: sauvegarde.name, contenu: decrypt(contenu, `backup:${id}`).toString("utf8") };
    } catch {
      throw new ApiError(410, "Le fichier de sauvegarde n'existe plus sur le disque", "FILE_MISSING");
    }
  }

  static async remove(id: string) {
    const sauvegarde = await this.get(id);

    if (sauvegarde.filePath) {
      // Le fichier peut avoir été supprimé à la main : ce n'est pas bloquant.
      await fs.unlink(sauvegarde.filePath).catch(() => undefined);
    }

    await db.backup.delete({ where: { id } });
    logger.info("Backup deleted", { id });
  }

  // Réinsère le contenu d'un export partiel sans toucher à ce qui existe déjà :
  // les enregistrements encore présents sont ignorés, jamais écrasés. Seuls
  // organisations, boutiques, catégories, produits et clients sont réinjectés ;
  // commandes, comptes, appartenances et paiements ne le sont pas.
  static async restore(id: string) {
    const snapshot = await this.get(id);
    const laterErasure = await db.erasureRecord.findFirst({ where: { erasedAt: { gte: snapshot.createdAt } }, select: { id: true } });
    if (laterErasure) throw new ApiError(409, "Cette sauvegarde précède un effacement RGPD : restauration interdite sans réconciliation des effacements", "RESTORE_ERASURE_CONFLICT");
    const { contenu } = await this.read(id);

    let donnees: any;
    try {
      donnees = JSON.parse(contenu);
    } catch {
      throw new ApiError(422, "Fichier de sauvegarde illisible", "INVALID_BACKUP");
    }

    const sansHorodatage = (lignes: any[]) =>
      (lignes || []).map(({ createdAt, updatedAt, deletedAt, ...reste }) => reste);

    const resultats = {
      organisations: 0,
      boutiques: 0,
      categories: 0,
      produits: 0,
      clients: 0,
    };

    const orgs = await db.organization.createMany({
      data: sansHorodatage(donnees.organisations),
      skipDuplicates: true,
    });
    resultats.organisations = orgs.count;

    const boutiques = await db.store.createMany({
      data: sansHorodatage(donnees.boutiques),
      skipDuplicates: true,
    });
    resultats.boutiques = boutiques.count;

    const categories = await db.category.createMany({
      data: sansHorodatage(donnees.categories),
      skipDuplicates: true,
    });
    resultats.categories = categories.count;

    const produits = await db.product.createMany({
      data: sansHorodatage(donnees.produits),
      skipDuplicates: true,
    });
    resultats.produits = produits.count;

    const clients = await db.customer.createMany({
      data: sansHorodatage(donnees.clients),
      skipDuplicates: true,
    });
    resultats.clients = clients.count;

    logger.info("Backup restored", { id, ...resultats });
    return resultats;
  }

  static async readEncrypted(id: string) {
    const backup = await this.get(id);
    if (!backup.filePath || backup.status !== "COMPLETED") throw new ApiError(400, "Sauvegarde indisponible", "BACKUP_INCOMPLETE");
    const contenu = await fs.readFile(backup.filePath, "utf8");
    if (!isEncrypted(contenu)) throw new ApiError(409, "Migration de sauvegarde requise", "BACKUP_NOT_ENCRYPTED");
    return { nom: backup.name, contenu };
  }
}
