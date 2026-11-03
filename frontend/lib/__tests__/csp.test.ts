import { construireCsp, genererNonce, modeCsp, modeCspPourHote } from "../csp";

describe("CSP du site", () => {
  const directive = (csp: string, nom: string) =>
    csp.split("; ").find((d) => d.startsWith(`${nom} `))?.slice(nom.length + 1).split(" ") ?? [];

  it("génère un nonce différent à chaque appel, en base64", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => genererNonce()));
    expect(nonces.size).toBe(50);
    expect([...nonces][0]).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("autorise les scripts par nonce et strict-dynamic, sans unsafe-inline ni eval en production", () => {
    const script = directive(construireCsp({ nonce: "abc==" }), "script-src");
    expect(script).toEqual(expect.arrayContaining(["'nonce-abc=='", "'strict-dynamic'", "https://js.stripe.com"]));
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("n'autorise unsafe-eval qu'en développement", () => {
    expect(directive(construireCsp({ nonce: "n", dev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("ne met pas de nonce dans style-src (il désactiverait unsafe-inline des attributs style)", () => {
    const style = directive(construireCsp({ nonce: "abc==" }), "style-src");
    expect(style).toContain("'unsafe-inline'");
    expect(style.some((s) => s.includes("nonce"))).toBe(false);
  });

  it("prévoit Stripe, les tuiles de carte, Cloudinary et l'API avec son WebSocket", () => {
    const csp = construireCsp({ nonce: "n", urlApi: "https://api.zupeat.com" });
    expect(directive(csp, "img-src")).toEqual(
      expect.arrayContaining(["https://res.cloudinary.com", "https://tile.openstreetmap.org", "https://api.zupeat.com"]),
    );
    expect(directive(csp, "connect-src")).toEqual(
      expect.arrayContaining(["https://api.zupeat.com", "wss://api.zupeat.com", "https://api.stripe.com"]),
    );
    expect(directive(csp, "frame-src")).toEqual(expect.arrayContaining(["https://js.stripe.com", "https://hooks.stripe.com", "blob:"]));
  });

  it("utilise ws:// pour une API en http (développement)", () => {
    expect(directive(construireCsp({ nonce: "n", urlApi: "http://localhost:3001" }), "connect-src")).toContain("ws://localhost:3001");
  });

  it("ferme les sorties de formulaire, object-src, base-uri et frame-ancestors", () => {
    const csp = construireCsp({ nonce: "n" });
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'self'"]);
    expect(directive(csp, "report-uri")).toEqual(["/api/csp-report"]);
  });

  it("choisit le mode à partir de la configuration ou du défaut fourni", () => {
    expect(modeCsp(undefined, "report-only")).toBe("report-only");
    expect(modeCsp("n'importe quoi", "report-only")).toBe("report-only");
    expect(modeCsp(" ENFORCE ", "report-only")).toBe("enforce");
    expect(modeCsp("off", "report-only")).toBe("off");
  });

  it("applique enforce par défaut aux domaines ZupDrive sans basculer les autres marques", () => {
    const précédent = process.env.NODE_ENV;
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "production";
    try {
      const domaines = ["zupdrive.com", "driver.zupdrive.com"];
      expect(modeCspPourHote("zupdrive.com:443", domaines, "report-only", undefined)).toBe("enforce");
      expect(modeCspPourHote("driver.zupdrive.com", domaines, "enforce", "report-only")).toBe("report-only");
      expect(modeCspPourHote("zupeat.com", domaines, "report-only", "enforce")).toBe("report-only");
      expect(modeCspPourHote("zupeat.com", domaines, "enforce", undefined)).toBe("enforce");
    } finally {
      if (précédent === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = précédent;
    }
  });

  it("ne permet pas de couper toute la CSP en production", () => {
    const précédent = process.env.NODE_ENV;
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "production";
    try {
      expect(modeCsp(undefined, "enforce")).toBe("enforce");
      expect(modeCsp("off", "report-only")).toBe("enforce");
      expect(() => modeCsp("bad-value", "report-only")).toThrow("CSP_MODE doit valoir");
    } finally {
      if (précédent === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = précédent;
    }
  });
});
