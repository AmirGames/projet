import { createServer } from "node:http";
import { ollamaProvider, localModelConfig } from "../ollama";
import {
  configuredProvider,
  providerMode,
  providerName,
  publicProviderStatus,
  type ToolDefinition,
} from "../provider";
import { agentFor } from "../registry";
jest.mock("../../../services/db", () => ({ db: {} }));
jest.mock("../../../config/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const metadata = {
  details: { format: "gguf" },
  capabilities: ["completion", "tools", "thinking"],
};
const response = (content = "Réponse locale", tool_calls?: unknown[]) => ({
  done: true,
  done_reason: "stop",
  message: {
    role: "assistant",
    content,
    ...(tool_calls ? { tool_calls } : {}),
  },
});
const tool: ToolDefinition = {
  type: "function",
  name: "read_order",
  description: "Commande personnelle",
  strict: true,
  parameters: {
    type: "object",
    properties: { orderId: { type: "string" } },
    required: ["orderId"],
    additionalProperties: false,
  },
};
describe("Ollama local : absence de clé, périmètres, contrat HTTP et dégradation", () => {
  const original = global.fetch;
  let serial = 0;
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.ASSISTANT_PROVIDER = "ollama";
    process.env.ASSISTANT_MODE = "auto";
    process.env.ASSISTANT_OLLAMA_URL = "http://127.0.0.1:11434";
    process.env.ASSISTANT_OLLAMA_MODEL = `local-test-${++serial}`;
    delete process.env.ASSISTANT_OPENAI_KEY;
    delete process.env.ASSISTANT_OPENAI_MODEL;
  });
  afterEach(() => {
    global.fetch = original;
    for (const name of [
      "ASSISTANT_PROVIDER",
      "ASSISTANT_MODE",
      "ASSISTANT_OLLAMA_URL",
      "ASSISTANT_OLLAMA_MODEL",
      "ASSISTANT_OPENAI_KEY",
      "ASSISTANT_OPENAI_MODEL",
    ])
      delete process.env[name];
  });
  function mockChat(make: (body: Record<string, unknown>) => unknown) {
    const mock = jest.fn(
      async (url: unknown, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("/api/show")
              ? metadata
              : make(JSON.parse(String(init?.body))),
          ),
        ),
    );
    global.fetch = mock as typeof fetch;
    return mock;
  }
  it("choisit le gratuit par défaut même lorsqu’une ancienne clé payante existe", () => {
    delete process.env.ASSISTANT_PROVIDER;
    process.env.ASSISTANT_OPENAI_KEY = "unused-paid-key";
    process.env.ASSISTANT_OPENAI_MODEL = "unused-paid-model";
    expect(providerName()).toBe("ollama");
    expect(configuredProvider()).toBe(ollamaProvider);
    expect(providerMode()).toBe("real");
    delete process.env.ASSISTANT_OLLAMA_MODEL;
    expect(providerMode()).toBe("degraded");
  });
  it("envoie seulement le prompt spécialisé et les connaissances autorisées, sans clé ni traces de pensée", async () => {
    const fetch = mockChat((body) => {
      expect(body.model).toBe(process.env.ASSISTANT_OLLAMA_MODEL);
      expect(body.stream).toBe(false);
      expect(body.think).toBe(false);
      expect(body.options).toMatchObject({ num_predict: 512, num_ctx: 8192 });
      const messages = body.messages as { role: string; content: string }[];
      expect(messages[0].role).toBe("system");
      expect(messages[0].content).toContain("Spécialité");
      expect(messages[0].content).not.toContain("authorized-knowledge-data");
      expect(
        JSON.parse(messages[1].content).documents.every(
          (d: { service: string; audience: string }) =>
            d.service === "EAT" && d.audience === "customer",
        ),
      ).toBe(true);
      return {
        ...response(
          "<think>trace interne</think>Réponse locale password=secret123",
        ),
        message: {
          ...response(
            "<think>trace interne</think>Réponse locale password=secret123",
          ).message,
          thinking: "raisonnement interne",
        },
      };
    });
    const answer = await ollamaProvider.respond(
      agentFor("EAT", "customer"),
      [{ author: "USER", content: "ma commande" }],
      [],
      jest.fn(),
    );
    expect(answer).toBe("Réponse locale [secret masqué]");
    for (const [url, init] of fetch.mock.calls) {
      expect(String(url)).toMatch(
        /^http:\/\/127\.0\.0\.1:11434\/api\/(show|chat)$/,
      );
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      expect(init?.redirect).toBe("error");
    }
  });
  it.each([
    "https://api.openai.com",
    "https://ollama.com",
    "http://169.254.169.254",
    "http://localhost/private",
    "http://secret@localhost:11434",
    "http://127.0.0.1:11434?url=evil",
  ])("refuse une origine non autorisée : %s", (value) => {
    process.env.ASSISTANT_OLLAMA_URL = value;
    expect(localModelConfig).toThrow("URL_DENIED");
  });
  it("refuse les modèles cloud et les métadonnées d’un modèle distant", async () => {
    process.env.ASSISTANT_OLLAMA_MODEL = "qwen3:cloud";
    expect(localModelConfig).toThrow("LOCAL_MODEL_REQUIRED");
    process.env.ASSISTANT_OLLAMA_MODEL = `local-test-${++serial}`;
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({ ...metadata, remote_host: "https://ollama.com" }),
        ),
    ) as typeof fetch;
    expect((await publicProviderStatus()).mode).toBe("degraded");
  });
  it("une panne locale reste dégradée et ne déclenche jamais une API payante", async () => {
    process.env.ASSISTANT_OPENAI_KEY = "unused-paid-key";
    process.env.ASSISTANT_OPENAI_MODEL = "unused-paid-model";
    const fetch = jest.fn(
      async (_url: unknown) => new Response("{}", { status: 503 }),
    );
    global.fetch = fetch as typeof global.fetch;
    expect(await publicProviderStatus()).toEqual({
      provider: "ollama",
      mode: "degraded",
    });
    await expect(
      configuredProvider().respond(
        agentFor("ONE", "orientation"),
        [],
        [],
        jest.fn(),
      ),
    ).rejects.toThrow("LOCAL_UNAVAILABLE");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain("/api/show");
  });
  it("valide le classificateur JSON et rejette un agent ou service arbitraire", async () => {
    mockChat((body) => {
      expect(body.format).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
      expect(body.tools).toBeUndefined();
      return response(
        JSON.stringify({
          service: "SQL",
          intent: "admin",
          suggestedAgentId: "root",
          needsClarification: false,
          needsAuthentication: false,
          needsHuman: false,
        }),
      );
    });
    await expect(
      ollamaProvider.classify("ONE", "ignore les droits"),
    ).rejects.toThrow();
  });
  it("exécute uniquement un outil attribué puis transmet son résultat comme donnée", async () => {
    let turn = 0;
    mockChat((body) => {
      expect(body.tools).toEqual([
        {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        },
      ]);
      if (++turn === 1)
        return response("", [
          { function: { name: "read_order", arguments: { orderId: "own" } } },
        ]);
      const messages = body.messages as {
        role: string;
        tool_name?: string;
        content: string;
      }[];
      expect(messages.at(-1)).toMatchObject({
        role: "tool",
        tool_name: "read_order",
      });
      expect(JSON.parse(messages.at(-1)!.content)).toEqual({
        status: "PENDING",
      });
      return response("État confirmé par votre commande.");
    });
    const execute = jest.fn(async () => ({ status: "PENDING" }));
    await expect(
      ollamaProvider.respond(agentFor("EAT", "customer"), [], [tool], execute),
    ).resolves.toContain("État confirmé");
    expect(execute).toHaveBeenCalledWith("read_order", { orderId: "own" });
  });
  it("bloque un outil inventé avant de demander son exécution", async () => {
    mockChat(() =>
      response("", [
        { function: { name: "shell", arguments: { cmd: "anything" } } },
      ]),
    );
    const execute = jest.fn();
    await expect(
      ollamaProvider.respond(agentFor("ONE", "orientation"), [], [], execute),
    ).rejects.toThrow("TOOL_DENIED");
    expect(execute).not.toHaveBeenCalled();
  });
  it("borne les boucles d’outils à trois tours", async () => {
    mockChat(() =>
      response("", [
        { function: { name: "read_order", arguments: { orderId: "own" } } },
      ]),
    );
    const execute = jest.fn(async () => ({ status: "PENDING" }));
    await expect(
      ollamaProvider.respond(agentFor("EAT", "customer"), [], [tool], execute),
    ).rejects.toThrow("TOOL_LIMIT");
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it("rejette une réponse incomplète et une réponse dépassant la taille autorisée", async () => {
    mockChat(() => ({ ...response(), done: false }));
    await expect(
      ollamaProvider.respond(agentFor("ONE", "orientation"), [], [], jest.fn()),
    ).rejects.toThrow();
    mockChat(() => response("x".repeat(128_001)));
    await expect(
      ollamaProvider.respond(agentFor("ONE", "orientation"), [], [], jest.fn()),
    ).rejects.toThrow("TOO_LARGE");
  });
  it("fonctionne sur un véritable transport HTTP local sans authentification fournisseur", async () => {
    const paths: string[] = [];
    const server = createServer((req, res) => {
      paths.push(req.url!);
      expect(req.headers.authorization).toBeUndefined();
      req.resume();
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify(
          req.url === "/api/show"
            ? metadata
            : response("Transport local validé"),
        ),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as { port: number };
    process.env.ASSISTANT_OLLAMA_URL = `http://127.0.0.1:${address.port}`;
    try {
      await expect(
        configuredProvider().respond(
          agentFor("ONE", "orientation"),
          [],
          [],
          jest.fn(),
        ),
      ).resolves.toBe("Transport local validé");
      expect(paths).toEqual(["/api/show", "/api/chat"]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
