import { describe, expect, it, jest } from "@jest/globals";

const authMiddleware: any = jest.fn();
jest.mock("../../../services/db", () => ({ db: {} }));
jest.mock("../../../config/env", () => ({ getEnv: () => ({ JWT_SECRET: "a".repeat(40), API_URL: "https://api.test" }) }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../../notifications/notification.service", () => ({ notifierPlateforme: jest.fn() }));
jest.mock("../../notifications/email.service", () => ({ EmailService: { sendEmail: jest.fn() } }));
jest.mock("../../files/file-upload.service", () => ({ FileUploadService: {} }));
jest.mock("../../payments/stripe", () => ({ stripe: {}, STRIPE_CONFIG: { currency: "eur" } }));
jest.mock("../../auth/auth.middleware", () => ({ authMiddleware }));
jest.mock("../../auth/permissions-plateforme.service", () => ({ exigerPermission: () => jest.fn() }));
import { MONTAGE_ZUPDRIVE } from "../zupdrive-montage";

interface RouteMontee {
  methode: string;
  chemin: string;
  authentifiee: boolean;
}

/** Aplatit un routeur Express en routes complètes ; « authentifiee » = authMiddleware passe avant le handler. */
function routesDe(routeur: any, prefixe: string): RouteMontee[] {
  const routes: RouteMontee[] = [];
  let gardeDuRouteur = false;
  for (const couche of routeur.stack) {
    if (couche.route) {
      const authentifiee = gardeDuRouteur || couche.route.stack.some((c: any) => c.handle === authMiddleware);
      for (const methode of Object.keys(couche.route.methods)) {
        routes.push({ methode: methode.toUpperCase(), chemin: prefixe + (couche.route.path === "/" ? "" : couche.route.path), authentifiee });
      }
    } else if (couche.handle === authMiddleware) {
      gardeDuRouteur = true;
    }
  }
  return routes;
}

const toutes = MONTAGE_ZUPDRIVE.flatMap(({ prefixe, routeur }) => routesDe(routeur, prefixe));

/** Deux routes se heurtent si elles ont la même méthode et le même motif, paramètres nommés ou non. */
const motif = (chemin: string) => chemin.replace(/:[^/]+/g, ":p");

describe("montage des routeurs ZupDrive", () => {
  it("monte des routes", () => {
    expect(toutes.length).toBeGreaterThan(40);
  });

  it("n'expose aucune route deux fois (méthode + chemin)", () => {
    const vues = new Map<string, string>();
    const doublons: string[] = [];
    for (const r of toutes) {
      const cle = `${r.methode} ${motif(r.chemin)}`;
      if (vues.has(cle)) doublons.push(`${cle} (déjà ${vues.get(cle)})`);
      vues.set(cle, r.chemin);
    }
    expect(doublons).toEqual([]);
  });

  it("aucune route n'est masquée par une route à paramètre déclarée avant elle", () => {
    // Ex. GET /:courseId déclaré avant GET /earnings : « earnings » serait pris pour un identifiant.
    const masquees: string[] = [];
    toutes.forEach((r, i) => {
      for (const avant of toutes.slice(0, i)) {
        if (avant.methode !== r.methode) continue;
        const a = avant.chemin.split("/");
        const b = r.chemin.split("/");
        if (a.length !== b.length) continue;
        const masque = a.every((seg, k) => seg === b[k] || (seg.startsWith(":") && !b[k].startsWith(":")));
        if (masque && a.some((seg, k) => seg.startsWith(":") && !b[k].startsWith(":"))) masquees.push(`${r.methode} ${r.chemin} masquée par ${avant.chemin}`);
      }
    });
    expect(masquees).toEqual([]);
  });

  it("chaque route exige un jeton (authMiddleware avant le handler)", () => {
    expect(toutes.filter((r) => !r.authentifiee).map((r) => `${r.methode} ${r.chemin}`)).toEqual([]);
  });
});
