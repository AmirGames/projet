import fs from "node:fs/promises";
import { ENCRYPTED_FIELDS } from "../src/modules/privacy/encrypted-fields";

const auth = new Set(["User", "MfaFactor", "SessionConnexion", "JetonRafraichissement", "CodeConnexion", "AccesEquipe", "Membership", "Staff", "PushDevice", "ApiKey", "InvitationSocieteDrive"]);
const finances = new Set(["Order", "OrderItem", "Payment", "Invoice", "PlatformInvoice", "CourierPayout", "MerchantPayout", "CourierTip"]);
const service = new Set(["Customer", "CustomerCart", "FavoriteStore", "Review", "ReviewReport", "CourierRating", "Courier", "OrderDelivery", "DeliveryOffer", "ChauffeurDrive", "CourseDrive", "NoteCourseDrive", "PropositionCourseDrive"]);
const documents = new Set(["CourierDocument", "OrganizationDocument", "DocumentChauffeurDrive"]);
const support = new Set(["MerchantTicket", "TicketMessage", "CourierSupportMessage", "DeliveryIncident"]);
const trace = new Set(["PrivacyAuditEvent", "SystemAuditLog", "SecurityEvent", "AcceptationConditions", "ErasureRecord", "PrivacyErasureRequest", "PrivacyLegalHold", "Backup", "MerchantArchive", "Notification", "Webhook", "WebhookDelivery", "MarketingCampaign"]);
const company = new Set(["Organization", "Store", "SocieteDrive", "VehiculeDrive"]);
const classify = (model: string) => auth.has(model) ? "identite_et_acces" : finances.has(model) ? "operation_et_comptabilite" : service.has(model) ? "profil_prestation_localisation" : documents.has(model) ? "document_sensible" : support.has(model) ? "support_incident" : trace.has(model) ? "trace_copie_integration" : company.has(model) ? "societe_et_representant" : "metier_revue_contexte";
const lines = ["modele;table;champ;type;nullable;classe;protection_applicative;index_ou_cle;finalite_reference"];
const schema = await fs.readFile("prisma/schema.prisma", "utf8");
const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
const modelNames = new Set(models.map((m) => m[1]));
for (const [, model, body] of models) {
  const table = body.match(/@@map\("([^"]+)"\)/)?.[1] || model;
  const indexed = new Set([...body.matchAll(/@@(?:index|unique|id)\(\[([^\]]+)\]/g)].flatMap((m) => m[1].split(",").map((f) => f.trim().split("(")[0])));
  for (const [, name, type, modifiers] of body.matchAll(/^\s*(\w+)\s+(\w+(?:\[\]|\?)?)([^\n]*)$/gm)) {
    const encrypted = ENCRYPTED_FIELDS[model]?.includes(name) || (model === "MfaFactor" && ["secretCipher", "pendingCipher"].includes(name));
    const hashed = /Hash$/.test(name) || name === "passwordHash" || (model === "MfaFactor" && name === "recoveryHashes");
    const relation = modelNames.has(type.replace(/\[\]|\?/, ""));
    const protection = encrypted ? "AES-256-GCM" : hashed ? "empreinte" : relation ? "relation_autorisee" : documents.has(model) && ["url", "documentUrl"].includes(name) ? "reference_fichier_AES-GCM" : "volume_chiffre_requis_ou_donnee_publique";
    lines.push([model, table, name, type, String(type.endsWith("?")), classify(model), protection, String(indexed.has(name) || /@(?:id|unique)\b/.test(modifiers)), "docs/rgpd/cartographie.md"].join(";"));
  }
}
await fs.mkdir("../docs/rgpd", { recursive: true });
await fs.writeFile("../docs/rgpd/inventaire-champs.csv", lines.join("\n") + "\n");
console.log(`${models.length} modèles, ${lines.length - 1} champs inventoriés`);
