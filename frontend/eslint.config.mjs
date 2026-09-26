import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    // ESLint 9 signale par défaut les directives devenues inutiles ; les
    // « eslint-disable no-img-element » restent, la règle étant coupée ici.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "off",
      // Règles du React Compiler, arrivées avec eslint-plugin-react-hooks 7
      // (eslint-config-next 16). Elles relèvent environ 170 motifs du code
      // existant — setState dans un effet, fonction utilisée avant sa
      // déclaration… — qui fonctionnaient déjà sous Next 14. En avertissement
      // le temps de les reprendre, pour ne pas bloquer le lint.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
