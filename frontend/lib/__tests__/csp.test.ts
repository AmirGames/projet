import { construireCsp, genererNonce, modeCsp } from "../csp";

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

  it("ferme object-src, base-uri et frame-ancestors, et rapporte à la route du site", () => {
    const csp = construireCsp({ nonce: "n" });
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'self'"]);
    expect(directive(csp, "report-uri")).toEqual(["/api/csp-report"]);
  });

  it("choisit le mode : observation par défaut, application ou arrêt sur demande", () => {
    expect(modeCsp(undefined)).toBe("report-only");
    expect(modeCsp("n'importe quoi")).toBe("report-only");
    expect(modeCsp(" ENFORCE ")).toBe("enforce");
    expect(modeCsp("off")).toBe("off");
  });
});
