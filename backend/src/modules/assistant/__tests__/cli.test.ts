import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

type Call = { path: string; body: Record<string, unknown> };
const metadata = {
  details: { format: "gguf" },
  capabilities: ["completion", "tools", "thinking"],
};
describe("Contrôle local Ollama indépendant de la configuration du backend", () => {
  let server: Server;
  let origin: string;
  let calls: Call[];
  let reply: (call: Call) => unknown;
  beforeEach(async () => {
    calls = [];
    reply = (call) =>
      call.path === "/api/show"
        ? metadata
        : {
            done: true,
            done_reason: "stop",
            message: {
              role: "assistant",
              content:
                "<think>trace à exclure</think>Réponse publique contrôlée.",
              thinking: "autre trace interne",
            },
          };
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const call = {
        path: req.url || "",
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      };
      calls.push(call);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reply(call)));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Port absent");
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const run = (generate = false) =>
    new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const env = { ...process.env };
      for (const name of [
        "DATABASE_URL",
        "JWT_SECRET",
        "JWT_REFRESH_SECRET",
        "API_URL",
        "FRONTEND_URL",
        "REDIS_URL",
        "ASSISTANT_OPENAI_KEY",
        "ASSISTANT_OPENAI_MODEL",
      ])
        delete env[name];
      Object.assign(env, {
        NODE_ENV: "test",
        // Ces durées sont rejetées par l’API : elles ne doivent pas empêcher le contrôle Ollama.
        JWT_EXPIRES_IN: "1h",
        JWT_REFRESH_EXPIRES_IN: "30d",
        ASSISTANT_OLLAMA_MODEL: "qwen3:8b",
        ASSISTANT_OLLAMA_URL: origin,
        DOTENV_CONFIG_PATH: path.join(
          tmpdir(),
          `assistant-missing-env-${crypto.randomUUID()}`,
        ),
      });
      const child = spawn(
        process.execPath,
        [
          require.resolve("tsx/cli"),
          path.resolve("src/cli/assistant-local.ts"),
          ...(generate ? ["--generate"] : []),
        ],
        { env, stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("Contrôle local trop long"));
      }, 12000);
      child.stdout.on("data", (data) => {
        output += data;
      });
      child.stderr.on("data", (data) => {
        output += data;
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, output });
      });
    });
  it("vérifie le modèle sans JWT, base ou démarrage de l’API", async () => {
    const result = await run();
    expect(result.code).toBe(0);
    expect(result.output).toContain("Modèle local disponible : qwen3:8b");
    expect(result.output).not.toContain("Invalid environment variables");
    expect(calls.map((c) => c.path)).toEqual(["/api/show"]);
  });
  it("génère seulement une réponse publique, sans outil ni trace et avec 4096 tokens de contexte", async () => {
    const result = await run(true);
    expect(result.code).toBe(0);
    expect(result.output).toContain("Réponse publique contrôlée.");
    expect(result.output).not.toContain("trace");
    const chat = calls.find((c) => c.path === "/api/chat")!.body;
    expect(chat.options).toMatchObject({ num_ctx: 4096 });
    expect(chat.think).toBe(false);
    expect(chat.tools).toBeUndefined();
    const messages = chat.messages as { role: string; content: string }[];
    const data = JSON.parse(messages[1].content);
    expect(data.documents.length).toBeGreaterThan(0);
    expect(
      data.documents.every(
        (d: {
          service: string;
          audience: string;
          orgId: unknown;
          storeId: unknown;
        }) =>
          d.service === "ONE" &&
          d.audience === "orientation" &&
          !d.orgId &&
          !d.storeId,
      ),
    ).toBe(true);
  });
  it("signale un modèle absent sans faux succès ni erreur JWT", async () => {
    reply = () => ({ error: "model not found" });
    const result = await run();
    expect(result.code).toBe(1);
    expect(result.output).toContain("Ollama est inaccessible");
    expect(result.output).not.toContain("Modèle local disponible");
    expect(result.output).not.toContain("Invalid environment variables");
  });
  it("refuse une proposition d’outil dans le contrôle public", async () => {
    reply = (call) =>
      call.path === "/api/show"
        ? metadata
        : {
            done: true,
            message: {
              role: "assistant",
              content: "Action réussie",
              tool_calls: [
                { function: { name: "cancel_ride", arguments: {} } },
              ],
            },
          };
    const result = await run(true);
    expect(result.code).toBe(1);
    expect(result.output).not.toContain("Action réussie");
    expect(calls.map((c) => c.path)).toEqual(["/api/show", "/api/chat"]);
  });
});
