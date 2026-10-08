import { Prisma } from "@prisma/client";
import { decrypt, encrypt, isEncrypted } from "./crypto";

/** Les champs de recherche/index et les coordonnées numériques sont couverts par le chiffrement du volume, voir politique. */
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  Organization: ["iban", "bic", "accountHolder", "vatNumber", "registrationNumber", "billingAddress", "billingPostalCode", "billingCity", "ownerFirstName", "ownerLastName", "ownerEmail", "ownerPhone", "customTermsNote"],
  Courier: ["iban", "bic", "accountHolder", "phone", "vehiclePlate", "licensePlate", "pushSubscription"],
  Customer: ["phone", "address", "city", "postalCode", "savedAddresses", "notes"],
  Order: ["customerName", "customerPhone", "deliveryAddress", "deliveryCity", "deliveryPostal", "notes", "rejectionNote"],
  Payment: ["stripeClientSecret"],
  MerchantArchive: ["organizationData", "storesData", "ordersData", "customersData"],
  Invoice: ["emetteurJson", "destinataireJson"],
  PlatformInvoice: ["sellerJson", "buyerJson", "ublXml"],
  ChauffeurDrive: ["telephone", "numeroLicence", "vehiculePlaque"],
  SocieteDrive: ["telephone"],
  VehiculeDrive: ["numeroLicence"],
  CourseDrive: ["departAdresse", "arriveeAdresse", "motifAnnulation"],
  CourierDocument: ["reviewNote"],
  OrganizationDocument: ["reviewNote", "fileName"],
  DocumentChauffeurDrive: ["noteExamen"],
  OrderDelivery: ["proofNote", "deliveryCode"],
  CourierSupportMessage: ["body"],
  MerchantTicket: ["description"],
  TicketMessage: ["body"],
  SystemAuditLog: ["changes", "ipAddress", "userAgent"],
  SecurityEvent: ["actor", "target", "details", "ipAddress", "userAgent"],
  CourierPayout: ["beneficiaryJson"],
  PayoutBatch: ["itemsJson"],
  Store: ["vatNumber", "registrationNumber"],
};

const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
const field = (model: string, name: string) => models.get(model)?.fields.find((f) => f.name === name);
// Prisma 7 expose un DMMF runtime réduit sans les valeurs par défaut SQL.
const ENCRYPTED_DEFAULTS: Record<string, Record<string, unknown>> = {
  Customer: { savedAddresses: [] },
  Invoice: { emetteurJson: {}, destinataireJson: {} },
  CourierPayout: { beneficiaryJson: {} },
  PayoutBatch: { itemsJson: [] },
  SecurityEvent: { target: "", details: "" },
};

/** Un objet quelconque (arguments Prisma, ligne lue), dont on ne suppose rien de plus. */
type Enreg = Record<string, unknown>;
const estEnreg = (valeur: unknown): valeur is Enreg => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

export function encryptData(model: string, data: Enreg): Enreg;
export function encryptData(model: string, data: unknown): unknown;
export function encryptData(model: string, data: unknown): unknown {
  if (Array.isArray(data)) return data.map((row) => encryptData(model, row));
  if (!estEnreg(data)) return data;
  const result: Enreg = { ...data };
  for (const [name, value] of Object.entries(data)) {
    const schema = field(model, name);
    if (ENCRYPTED_FIELDS[model]?.includes(name) && value != null && value !== Prisma.DbNull && value !== Prisma.JsonNull && value !== Prisma.AnyNull) {
      // Déjà chiffré en amont (ex. origine de la requête) : ne pas rechiffrer.
      if (isEncrypted(value)) continue;
      const scalar = schema?.type === "Json" ? value : estEnreg(value) && "set" in value ? value.set : value;
      if (scalar == null) continue;
      const encoded = encrypt(JSON.stringify(scalar), `${model}.${name}`);
      result[name] = schema?.type === "Json" ? { _encrypted: encoded } : encoded;
    } else if (schema?.kind === "object" && value && typeof value === "object") {
      result[name] = transformNestedWrite(schema.type, value);
    }
  }
  return result;
}

function createData(model: string, data: unknown): unknown {
  if (Array.isArray(data)) return data.map((row) => createData(model, row));
  const values: Enreg = estEnreg(data) ? { ...data } : {};
  for (const [name, fallback] of Object.entries(ENCRYPTED_DEFAULTS[model] || {})) if (values[name] === undefined) values[name] = fallback;
  return encryptData(model, values);
}

function transformNestedWrite(model: string, operations: unknown): unknown {
  if (!estEnreg(operations)) return operations;
  const result: Enreg = { ...operations };
  for (const name of ["create", "update", "upsert", "createMany", "updateMany", "connectOrCreate"]) {
    if (!operations[name]) continue;
    const transform = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(transform);
      if (name === "create") return createData(model, value);
      if (!estEnreg(value)) return value;
      const copie: Enreg = { ...value };
      let wrapped = false;
      for (const key of ["data", "create", "update"]) {
        if (value[key]) { copie[key] = key === "create" || name === "createMany" ? createData(model, value[key]) : encryptData(model, value[key]); wrapped = true; }
      }
      return wrapped ? copie : encryptData(model, value);
    };
    result[name] = transform(operations[name]);
  }
  return result;
}

export function decryptResult(model: string, data: Enreg): Enreg;
export function decryptResult(model: string, data: unknown): unknown;
export function decryptResult(model: string, data: unknown): unknown {
  if (Array.isArray(data)) return data.map((row) => decryptResult(model, row));
  if (!estEnreg(data)) return data;
  const result: Enreg = { ...data };
  for (const [name, value] of Object.entries(data)) {
    const schema = field(model, name);
    if (ENCRYPTED_FIELDS[model]?.includes(name) && value != null) {
      const encoded = schema?.type === "Json" ? (estEnreg(value) ? value._encrypted : undefined) : value;
      if (isEncrypted(encoded)) result[name] = JSON.parse(decrypt(encoded, `${model}.${name}`).toString("utf8"));
      else if (process.env.NODE_ENV === "production" && process.env.PRIVACY_ALLOW_LEGACY_READ !== "true") throw new Error(`Migration requise : ${model}.${name}`);
    } else if (schema?.kind === "object") result[name] = decryptResult(schema.type, value);
  }
  return result;
}

/** Les recherches sur les champs chiffrés ne doivent jamais échouer silencieusement. */
export function checkEncryptedQuery(model: string, args: Enreg): void {
  const visit = (value: unknown, currentModel: string) => {
    if (Array.isArray(value)) { value.forEach((v) => visit(v, currentModel)); return; }
    if (!value || typeof value !== "object") return;
    for (const [name, child] of Object.entries(value)) {
      if (ENCRYPTED_FIELDS[currentModel]?.includes(name) && child != null) throw new Error(`Filtre ou tri interdit sur champ chiffré : ${currentModel}.${name}`);
      const schema = field(currentModel, name);
      visit(child, schema?.kind === "object" ? schema.type : currentModel);
    }
  };
  visit(args.where, model); visit(args.orderBy, model); visit(args.having, model);
  visit(args._min, model); visit(args._max, model);
  const regroupements = Array.isArray(args.by) ? args.by : [];
  for (const name of regroupements) if (typeof name === "string" && ENCRYPTED_FIELDS[model]?.includes(name)) throw new Error("Regroupement sur donnée chiffrée interdit");
  const distincts = Array.isArray(args.distinct) ? args.distinct : args.distinct ? [args.distinct] : [];
  for (const name of distincts) if (typeof name === "string" && ENCRYPTED_FIELDS[model]?.includes(name)) throw new Error("Distinct sur donnée chiffrée interdit");
}

export const encryptionExtension = Prisma.defineExtension({
  name: "privacy-encryption",
  query: { $allModels: { async $allOperations({ model, operation, args, query }) {
    checkEncryptedQuery(model, args);
    const input: Enreg = { ...args };
    if (["create", "createMany", "createManyAndReturn"].includes(operation)) input.data = createData(model, input.data);
    if (["update", "updateMany", "updateManyAndReturn"].includes(operation)) input.data = encryptData(model, input.data);
    if (operation === "upsert") { input.create = createData(model, input.create); input.update = encryptData(model, input.update); }
    return decryptResult(model, await query(input));
  } } },
});
