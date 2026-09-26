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
      // Règles du React Compiler apportées par eslint-plugin-react-hooks 7 :
      // en avertissement le temps de corriger le code existant, qui les
      // enfreint à ~170 endroits.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
