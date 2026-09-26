import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "off",
      // lib/use-effect-chargement.ts : un effet dont on vérifie les dépendances.
      "react-hooks/exhaustive-deps": ["warn", { additionalHooks: "^useEffectChargement$" }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
