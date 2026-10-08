import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { decrypt, encrypt, isEncrypted, keyring } from "../modules/privacy/crypto";
import { ENCRYPTED_FIELDS, decryptResult, encryptData } from "../modules/privacy/encrypted-fields";
import { privateRoot, readPrivate, writePrivate } from "../modules/files/private-storage";
import { scanFile } from "../modules/files/antivirus";
import { detecterType } from "../utils/file-type";
import { codeErreur } from "../utils/code-erreur";

const mode = process.argv[2] || "--check";
if (!["--check", "--apply", "--rotate"].includes(mode)) throw new Error("Usage : privacy-storage --check|--apply|--rotate");
const mutate = mode !== "--check";
if (mutate && process.env.PRIVACY_MAINTENANCE_ACK !== "stopped") throw new Error("Arrêtez l'API et les tâches, puis définissez PRIVACY_MAINTENANCE_ACK=stopped");
keyring();
process.env.PRIVACY_ALLOW_LEGACY_READ = "true";
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
let problems = 0;
const counts: Record<string, number> = {};
try {
  if (mutate) await client.merchantArchive.updateMany({ data: { ordersData: Prisma.DbNull, customersData: Prisma.DbNull } });
  for (const [model, fields] of Object.entries(ENCRYPTED_FIELDS)) {
    const delegate = (client as any)[model[0].toLowerCase() + model.slice(1)];
    const schema = Prisma.dmmf.datamodel.models.find((m) => m.name === model)!;
    let cursor: string | undefined;
    counts[model] = 0;
    for (;;) {
      const rows = await delegate.findMany({ select: { id: true, ...Object.fromEntries(fields.map((name) => [name, true])) }, orderBy: { id: "asc" }, take: 250, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      for (const row of rows) {
        const clear: any = {};
        for (const name of fields) {
          if (row[name] == null) continue;
          const json = schema.fields.find((f) => f.name === name)?.type === "Json";
          const cipher = json ? row[name]?._encrypted : row[name];
          if (isEncrypted(cipher)) {
            decrypt(cipher, `${model}.${name}`);
            if (mode === "--rotate") clear[name] = decryptResult(model, { [name]: row[name] })[name];
          } else { counts[model]++; problems++; clear[name] = row[name]; }
        }
        if (mutate && Object.keys(clear).length) await delegate.update({ where: { id: row.id }, data: encryptData(model, clear) });
      }
      if (rows.length < 250) break;
      cursor = rows.at(-1).id;
    }
  }
  for (const folder of ["drivers", "merchants", "deliveries", "chauffeurs"]) {
    const legacy = path.resolve("uploads", folder);
    let names: string[] = [];
    try { names = await fs.readdir(legacy); } catch (err) { if (codeErreur(err) !== "ENOENT") throw err; }
    counts[`legacy:${folder}`] = names.length; problems += names.length;
    for (const name of names) {
      const relative = `${folder}/${name}`, source = path.join(legacy, name);
      if (!(await fs.lstat(source)).isFile()) throw new Error("Entrée de stockage ancienne non régulière");
      if (mutate) {
        const data = await fs.readFile(source);
        if (!detecterType(data) || data.length > 5 * 1024 * 1024) throw new Error("Ancien document invalide : réimport manuel requis");
        await scanFile(data);
        try { await writePrivate(relative, data); } catch (error) { if (codeErreur(error) !== "EEXIST") throw error; }
        if (!(await readPrivate(relative)).equals(data)) throw new Error("Migration documentaire non vérifiée");
        await fs.unlink(source);
      }
    }
    let privateNames: string[] = [];
    try { privateNames = await fs.readdir(path.join(privateRoot(), folder)); } catch (err) { if (codeErreur(err) !== "ENOENT") throw err; }
    for (const name of privateNames) {
      const relative = `${folder}/${name}`;
      const data = await readPrivate(relative);
      if (mode === "--rotate") {
        const temporary = path.join(privateRoot(), relative + ".rotation");
        await fs.writeFile(temporary, encrypt(data, `file:${relative}`), { mode: 0o600 });
        await fs.rename(temporary, path.join(privateRoot(), relative));
      }
    }
  }
  // Les sauvegardes « base-… » de deploy/zup.sh vivent sur l'hôte, déjà chiffrées par age :
  // elles ne sont ni lisibles depuis ce conteneur ni à réécrire.
  const backups = await client.backup.findMany({ where: { status: "COMPLETED", filePath: { not: null }, NOT: { name: { startsWith: "base-" } } } });
  counts.legacyBackups = 0;
  for (const backup of backups) {
    const content = await fs.readFile(backup.filePath!, "utf8");
    const clear = isEncrypted(content) ? decrypt(content, `backup:${backup.id}`).toString("utf8") : content;
    if (!isEncrypted(content)) { counts.legacyBackups++; problems++; }
    if (mutate && (!isEncrypted(content) || mode === "--rotate")) await fs.writeFile(backup.filePath!, encrypt(clear, `backup:${backup.id}`), { mode: 0o600 });
  }
  const checks = [{ delegate: client.courierDocument, field: "documentUrl" }, { delegate: client.organizationDocument, field: "documentUrl" }, { delegate: client.documentChauffeurDrive, field: "url" }] as const;
  counts.externalOrMissingDocuments = 0;
  for (const { delegate, field } of checks) {
    const rows: any[] = await (delegate as any).findMany({ select: { [field]: true } });
    for (const row of rows) {
      const pathname = row[field]?.split("/uploads/")[1];
      try { if (!pathname) throw new Error("external"); await readPrivate(pathname); }
      catch { counts.externalOrMissingDocuments++; problems++; }
    }
  }
  console.log(JSON.stringify({ mode, counters: counts, storageVerified: !mutate && problems === 0, next: mutate ? "Exécuter --check avant démarrage" : problems ? "Corriger les problèmes ; ne pas ouvrir au public" : "Stockage applicatif vérifié ; preuves infrastructure et juridiques encore requises" }, null, 2));
  if (!mutate && problems > 0) process.exitCode = 2;
} catch (error: any) {
  // Jamais le message : il peut contenir des valeurs. Seulement la nature de l'erreur.
  const nature = [error?.name, error?.code].filter((v) => typeof v === "string" && /^[A-Za-z0-9_]{1,40}$/.test(v)).join(" ");
  console.error(`Vérification/migration RGPD en échec (clé, base, antivirus ou fichier)${nature ? ` : ${nature}` : ""} ; aucune ouverture publique autorisée`);
  process.exitCode = 1;
} finally { await client.$disconnect(); }
