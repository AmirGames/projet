import { beforeEach, describe, expect, it } from "@jest/globals";

import { Surveillance, centile, resumeErreur } from "../surveillance.service";
import { routeGenerique } from "../../middleware/surveillance";

describe("routeGenerique", () => {
  it("ramène les identifiants à leur forme générique", () => {
    expect(routeGenerique("/api/orders/cmf3k2x9p0001abcdefghij/status")).toBe("/api/orders/:id/status");
    expect(routeGenerique("/api/stores/12/products?page=2")).toBe("/api/stores/:n/products");
    expect(routeGenerique("/api/x/550e8400-e29b-41d4-a716-446655440000")).toBe("/api/x/:id");
    expect(routeGenerique("/api/customers/a@b.fr")).toBe("/api/customers/:email");
  });

  it("garde les segments lisibles et regroupe les fichiers déposés", () => {
    expect(routeGenerique("/api/stores/slug/pizza-roma")).toBe("/api/stores/slug/pizza-roma");
    expect(routeGenerique("/uploads/photos/abc.jpg")).toBe("/uploads/*");
    expect(routeGenerique("/")).toBe("/");
  });
});

describe("centile", () => {
  it("rend 0 sans valeur, et le bon rang sinon", () => {
    expect(centile([], 95)).toBe(0);
    const cent = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(centile(cent, 50)).toBe(50);
    expect(centile(cent, 95)).toBe(95);
    expect(centile(cent, 100)).toBe(100);
  });
});

describe("Surveillance", () => {
  beforeEach(() => Surveillance.reinitialiser());

  it("compte les requêtes, les erreurs et les durées", () => {
    Surveillance.requete("GET /api/a", 200, 10);
    Surveillance.requete("GET /api/a", 404, 20);
    Surveillance.requete("GET /api/a", 500, 30);
    Surveillance.requete("POST /api/b", 200, 40);

    const fenetre = Surveillance.fenetre(5);
    expect(fenetre.requetes).toBe(4);
    expect(fenetre.erreurs4xx).toBe(1);
    expect(fenetre.erreurs5xx).toBe(1);
    expect(fenetre.tauxErreur5xx).toBe(25);
    expect(fenetre.p95Ms).toBe(40);

    const [a] = Surveillance.routes();
    expect(a.route).toBe("GET /api/a");
    expect(a.requetes).toBe(3);
    expect(a.erreurs5xx).toBe(1);
    expect(a.moyenneMs).toBe(20);
  });

  it("rend une série d'une minute par point, minutes vides comprises", () => {
    Surveillance.requete("GET /", 200, 5);
    const serie = Surveillance.serie(60);
    expect(serie).toHaveLength(60);
    expect(serie[59].requetes).toBe(1);
    expect(serie[0].requetes).toBe(0);
  });

  it("regroupe une même erreur navigateur en une ligne", () => {
    const erreur = { message: "x is undefined", page: "/client", source: "app.js:1:2" };
    Surveillance.erreurNavigateur(erreur);
    Surveillance.erreurNavigateur({ ...erreur, page: "/client/orders" });
    Surveillance.erreurNavigateur({ ...erreur, message: "autre" });

    const erreurs = Surveillance.erreursNavigateur();
    expect(erreurs).toHaveLength(2);
    expect(erreurs.find((e) => e.message === "x is undefined")?.occurrences).toBe(2);
    expect(Surveillance.fenetre(5).erreursNavigateur).toBe(3);
  });

  it("suit les passages des tâches, et signale les échecs répétés", async () => {
    Surveillance.declarerTache("t", "Tâche", 1000);

    await Surveillance.executerTache("t", async () => 1);
    expect(Surveillance.taches()[0]).toMatchObject({ etat: "OK", executions: 1, echecs: 0 });

    for (let i = 0; i < 3; i++) {
      await expect(
        Surveillance.executerTache("t", async () => {
          throw new Error("boum");
        })
      ).rejects.toThrow("boum");
    }

    expect(Surveillance.taches()[0]).toMatchObject({
      etat: "PANNE",
      executions: 4,
      echecs: 3,
      echecsDeSuite: 3,
      derniereErreur: "boum",
    });

    await Surveillance.executerTache("t", async () => 1);
    expect(Surveillance.taches()[0].etat).toBe("OK");
  });

  it("garde les pannes serveur avec leur pile abrégée", () => {
    Surveillance.erreurServeur({
      route: "GET /api/x",
      statut: 500,
      message: "Error: boum",
      pile: Array.from({ length: 20 }, (_, i) => `ligne ${i}`).join("\n"),
    });
    const [erreur] = Surveillance.erreursServeur();
    expect(erreur.statut).toBe(500);
    expect(erreur.pile?.split("\n")).toHaveLength(8);
  });

  it("relève l'état du processus", () => {
    const p = Surveillance.processus();
    expect(p.memoire.tasUtiliseMo).toBeGreaterThan(0);
    expect(p.dureeFonctionnementS).toBeGreaterThanOrEqual(0);
  });
});

describe("resumeErreur", () => {
  it("garde la cause d'une erreur Prisma sur plusieurs lignes", () => {
    const err = new Error("\nInvalid `prisma.$queryRaw()` invocation:\n\n\nCan't reach database server at localhost:5432");
    expect(resumeErreur(err)).toBe("Can't reach database server at localhost:5432");
    expect(resumeErreur("simple")).toBe("simple");
  });
});
