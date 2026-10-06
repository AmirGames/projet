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
    },
  },
];
