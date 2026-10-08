import { violationsDuCorps } from "../rapport-csp";

describe("rapports de violation CSP", () => {
  it("lit le format report-uri et retire requête et fragment de la page", () => {
    const [v] = violationsDuCorps({
      "csp-report": {
        "document-uri": "https://zupeat.com/suivi/abc?jeton=SECRET#x",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/x.js?k=1",
        disposition: "report",
      },
    });
    expect(v.page).toBe("/suivi/abc");
    expect(v.message).toBe("CSP script-src-elem observé : https://evil.example/x.js");
    expect(JSON.stringify(v)).not.toContain("SECRET");
  });

  it("lit le format Reporting API", () => {
    const violations = violationsDuCorps([
      { type: "csp-violation", body: { documentURL: "https://zupeat.com/", effectiveDirective: "img-src", blockedURL: "https://cdn.exemple.org/a.png", disposition: "enforce" } },
      { type: "deprecation", body: {} },
    ]);
    expect(violations).toEqual([{ message: "CSP img-src bloqué : https://cdn.exemple.org/a.png", page: "/", source: undefined }]);
  });

  it("garde les mots-clés inline et eval tels quels", () => {
    const [v] = violationsDuCorps({ "csp-report": { "document-uri": "https://zupeat.com/login", "effective-directive": "script-src", "blocked-uri": "inline" } });
    expect(v.message).toBe("CSP script-src observé : inline");
  });

  it("ignore les extensions du navigateur", () => {
    expect(violationsDuCorps({ "csp-report": { "document-uri": "https://zupeat.com/", "effective-directive": "script-src", "blocked-uri": "chrome-extension://abc/x.js" } })).toEqual([]);
    expect(violationsDuCorps({ "csp-report": { "document-uri": "https://zupeat.com/", "effective-directive": "script-src", "blocked-uri": "inline", "source-file": "moz-extension://abc/c.js" } })).toEqual([]);
  });

  it("borne les textes et refuse ce qui n'est pas un rapport", () => {
    const [v] = violationsDuCorps({ "csp-report": { "document-uri": "https://zupeat.com/" + "a".repeat(2000), "effective-directive": "x".repeat(500), "blocked-uri": "https://h.example/" + "b".repeat(5000) } });
    expect(v.message.length).toBeLessThanOrEqual(500);
    expect(v.page.length).toBeLessThanOrEqual(300);
    for (const corps of [null, "texte", 42, {}, [], [{ type: "csp-violation" }], { "csp-report": "nope" }]) {
      expect(violationsDuCorps(corps)).toEqual([]);
    }
  });
});
