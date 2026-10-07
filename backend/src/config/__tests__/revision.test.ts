import { describe, expect, it } from "@jest/globals";
import { revisionDuBuild } from "../revision";

describe("révision du build exposée par /health", () => {
  it("rend les 12 premiers caractères d'un commit", () => {
    expect(revisionDuBuild({ GIT_SHA: "2397c72913309b3c052a1f3168dcfaae16a5b404" })).toBe("2397c7291330");
  });

  it("« inconnue » sans valeur, avec la valeur par défaut de l'image, ou avec une valeur étrangère", () => {
    expect(revisionDuBuild({})).toBe("inconnue");
    expect(revisionDuBuild({ GIT_SHA: "inconnue" })).toBe("inconnue");
    expect(revisionDuBuild({ GIT_SHA: "<script>alert(1)</script>" })).toBe("inconnue");
    expect(revisionDuBuild({ GIT_SHA: "abc" })).toBe("inconnue");
  });
});
