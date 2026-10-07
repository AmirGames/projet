import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

// Configuration minimale : règles « recommended » de typescript-eslint, sans
// typage (rapide), en avertissements pour ne pas bloquer le code existant.
export default [
  { ignores: ["dist/**", "node_modules/**", "prisma/**", "coverage/**"] },
  {
    files: ["src/**/*.ts"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: "latest", sourceType: "module" } },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...Object.fromEntries(
        Object.entries(tsPlugin.configs["recommended"].rules ?? {}).map(([k, v]) => [k, v === "error" || v === 2 ? "warn" : v])
      ),
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // Les tests simulent la base, Express et Stripe : leurs doublures sont
  // typées « any » à dessein. Le cliquet d'avertissements (--max-warnings) doit
  // mesurer le code livré, pas ses doublures de test.
  {
    files: ["src/**/__tests__/**/*.ts", "src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
