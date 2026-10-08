/**
 * Une base factice à deux organisations, pour les tests « Chacun chez soi ».
 *
 * Chaque test importe `db` dans sa fabrique `jest.mock` et pose le jeton avec
 * `comptesFactices`. Les écritures sont consignées dans `ecritures` : un refus
 * d'accès doit les laisser vides.
 */

export const ID = {
  orgA: "organisationa0000000000001",
  orgB: "organisationb0000000000002",
  storeA1: "cboutiquea100000000000000",
  storeA2: "cboutiquea200000000000000",
  storeB1: "cboutiqueb100000000000000",
  staffA1: "personnela100000000000001",
  staffA2: "personnela200000000000002",
  staffB1: "personnelb100000000000003",
  catA1: "categoriea10000000000001",
  catA2: "categoriea20000000000002",
  catB1: "categorieb10000000000003",
  prodA1: "produita1000000000000001",
  prodA2: "produita2000000000000002",
  prodB1: "produitb1000000000000003",
  varA1: "declinaisona1000000000001",
  tagA1: "etiqa100000000000000001",
};

/** Alice : ADMIN de A. Bob : ADMIN de B. Dave : gérant de la seule boutique A1. Carol : employée de A1. */
export const MEMBRES: Record<string, { orgId: string; role: string; storeIds: string[] }[]> = {
  alice: [{ orgId: ID.orgA, role: "ADMIN", storeIds: [] }],
  bob: [{ orgId: ID.orgB, role: "ADMIN", storeIds: [] }],
  dave: [{ orgId: ID.orgA, role: "STORE_MANAGER", storeIds: [ID.storeA1] }],
  carol: [{ orgId: ID.orgA, role: "STORE_STAFF", storeIds: [ID.storeA1] }],
  // Un compte connecté qui n'appartient à aucune organisation.
  erin: [],
};

export const UTILISATEURS = Object.keys(MEMBRES);

const BOUTIQUES = [
  { id: ID.storeA1, orgId: ID.orgA, deletedAt: null },
  { id: ID.storeA2, orgId: ID.orgA, deletedAt: null },
  { id: ID.storeB1, orgId: ID.orgB, deletedAt: null },
];
const PERSONNEL = [
  { id: ID.staffA1, storeId: ID.storeA1 },
  { id: ID.staffA2, storeId: ID.storeA2 },
  { id: ID.staffB1, storeId: ID.storeB1 },
];
const CATEGORIES = [
  { id: ID.catA1, storeId: ID.storeA1, name: "Entrées" },
  { id: ID.catA2, storeId: ID.storeA2, name: "Plats" },
  { id: ID.catB1, storeId: ID.storeB1, name: "Boissons" },
];
const PRODUITS = [
  { id: ID.prodA1, storeId: ID.storeA1, name: "Salade", deletedAt: null, categoryId: ID.catA1 },
  { id: ID.prodA2, storeId: ID.storeA2, name: "Pâtes", deletedAt: null, categoryId: ID.catA2 },
  { id: ID.prodB1, storeId: ID.storeB1, name: "Soda", deletedAt: null, categoryId: ID.catB1 },
];
const DECLINAISONS = [{ id: ID.varA1, productId: ID.prodA1 }];

const boutiqueDe = (storeId: string) => BOUTIQUES.find(b => b.id === storeId) ?? null;

/** Évalue un filtre Prisma simple (id, orgId, deletedAt, in, AND, OR) sur une boutique. */
export function boutiqueCorrespond(boutique: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([cle, filtre]: [string, any]) => {
    if (filtre === undefined) return true;
    if (cle === "AND") return (Array.isArray(filtre) ? filtre : [filtre]).every(f => boutiqueCorrespond(boutique, f));
    if (cle === "OR") return filtre.some((f: any) => boutiqueCorrespond(boutique, f));
    if (filtre !== null && typeof filtre === "object" && "in" in filtre) return filtre.in.includes(boutique[cle]);
    return (boutique[cle] ?? null) === filtre;
  });
}

const ECRITURES = new Set(["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"]);
/** Tables dont l'écriture n'est pas une modification de donnée métier (traçabilité de sécurité). */
const TABLES_DE_TRACE = new Set(["systemAuditLog", "securityEvent"]);

/** Les écritures tentées depuis le dernier `reinitialiser()` : « table.méthode ». */
export const ecritures: string[] = [];

const erreurIntrouvable = () => Object.assign(new Error("Record not found"), { code: "P2025" });

const surcharges: Record<string, Record<string, (args: any) => Promise<any>>> = {
  user: {
    findUnique: async ({ where }: any) =>
      UTILISATEURS.includes(where.id)
        ? { id: where.id, email: `${where.id}@exemple.test`, status: "ACTIVE", isSuperOwner: false, isSystemAdmin: false, accesEquipe: [], passwordChangedAt: null }
        : null,
  },
  membership: {
    findMany: async ({ where }: any) => MEMBRES[where.userId] ?? [],
    findFirst: async ({ where }: any) => (MEMBRES[where.userId] ?? []).find(m => m.orgId === where.orgId) ? { id: "appartenance" } : null,
  },
  organization: {
    findUnique: async ({ where }: any) =>
      [ID.orgA, ID.orgB].includes(where.id) ? { id: where.id, name: "Org", status: "ACTIVE", approvedAt: new Date(), stores: [], memberships: [] } : null,
  },
  store: {
    findUnique: async ({ where }: any) => boutiqueDe(where.id),
    findFirst: async ({ where }: any) => BOUTIQUES.find(b => boutiqueCorrespond(b, where)) ?? null,
    findMany: async ({ where }: any) => BOUTIQUES.filter(b => boutiqueCorrespond(b, where)),
  },
  staff: {
    findUnique: async ({ where }: any) => {
      const personnel = PERSONNEL.find(p => p.id === where.id);
      const boutique = personnel && boutiqueDe(personnel.storeId);
      if (!personnel || !boutique || !boutiqueCorrespond(boutique, where.store)) return null;
      return { ...personnel, name: "Employé", store: { orgId: boutique.orgId } };
    },
    update: async ({ where, data }: any) => {
      const personnel = PERSONNEL.find(p => p.id === where.id);
      const boutique = personnel && boutiqueDe(personnel.storeId);
      if (!personnel || !boutique || !boutiqueCorrespond(boutique, where.store)) throw erreurIntrouvable();
      return { ...personnel, ...data };
    },
    delete: async ({ where }: any) => {
      const personnel = PERSONNEL.find(p => p.id === where.id);
      const boutique = personnel && boutiqueDe(personnel.storeId);
      if (!personnel || !boutique || !boutiqueCorrespond(boutique, where.store)) throw erreurIntrouvable();
      return personnel;
    },
    findMany: async ({ where }: any) => PERSONNEL.filter(p => {
      const boutique = boutiqueDe(p.storeId)!;
      return (!where?.storeId || where.storeId === p.storeId) && boutiqueCorrespond(boutique, where?.store);
    }).map(p => ({ ...p, name: "Employé", store: { id: p.storeId, name: "Boutique" } })),
    create: async ({ data }: any) => ({ id: "nouveau", ...data }),
  },
  category: {
    findUnique: async ({ where }: any) => {
      const categorie = CATEGORIES.find(c => c.id === where.id);
      return categorie ? { ...categorie, store: { orgId: boutiqueDe(categorie.storeId)!.orgId } } : null;
    },
  },
  product: {
    findUnique: async ({ where }: any) => {
      const produit = PRODUITS.find(p => p.id === where.id);
      return produit ? { ...produit, store: { orgId: boutiqueDe(produit.storeId)!.orgId } } : null;
    },
  },
  productVariant: {
    findUnique: async ({ where }: any) => DECLINAISONS.find(v => v.id === where.id) ?? null,
  },
};

const tables: Record<string, Record<string, any>> = {};

export const db: any = new Proxy({}, {
  get(_cible, table: string) {
    if (table === "$transaction") {
      return async (argument: any) => (typeof argument === "function" ? argument(db) : Promise.all(argument));
    }
    if (!tables[table]) {
      const methodes: Record<string, any> = {};
      tables[table] = new Proxy(methodes, {
        get(_m, methode: string) {
          if (!methodes[methode]) {
            methodes[methode] = async (args: any) => {
              const surcharge = surcharges[table]?.[methode];
              // Une écriture qui lève (filtre de périmètre, P2025) n'a rien modifié : elle ne compte pas.
              let resultat: any;
              if (surcharge) resultat = await surcharge(args);
              else if (methode === "findMany") resultat = [];
              else if (methode === "count") resultat = 0;
              else if (methode === "findUnique" || methode === "findFirst") resultat = null;
              else resultat = { id: "objet", ...(args?.data ?? {}) };
              if (ECRITURES.has(methode) && !TABLES_DE_TRACE.has(table)) ecritures.push(`${table}.${methode}`);
              return resultat;
            };
          }
          return methodes[methode];
        },
      }) as any;
    }
    return tables[table];
  },
});

export function reinitialiser() {
  ecritures.length = 0;
}

/** Le contenu de la fabrique `jest.mock("…/auth.service")` : le jeton est le nom de l'utilisateur. */
export function verifierJetonFactice(jeton: string) {
  if (!UTILISATEURS.includes(jeton)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ApiError } = require("../middleware/errorHandler");
    throw new ApiError(401, "Jeton invalide", "INVALID_TOKEN");
  }
  return { userId: jeton, sid: `session-${jeton}` };
}
