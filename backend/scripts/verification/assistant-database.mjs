import { spawnSync } from "node:child_process";

const configured = process.env.ASSISTANT_TEST_DATABASE_URL;
if (!configured)
  throw new Error(
    "ASSISTANT_TEST_DATABASE_URL requis : base locale dédiée, schéma migré, nom terminé par _test",
  );
const url = new URL(configured);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  !url.pathname.endsWith("_test")
)
  throw new Error("Seule une base PostgreSQL locale *_test est autorisée");
const result = spawnSync(
  process.execPath,
  [
    "node_modules/jest/bin/jest.js",
    "src/modules/assistant/__tests__",
    "--runInBand",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: configured },
  },
);
process.exit(result.status ?? 1);
