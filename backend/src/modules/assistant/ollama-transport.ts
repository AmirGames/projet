import { z } from "zod";

// Transport local indépendant du backend : aucun chargement de session, base ou secrets JWT.
/** Seule une origine locale configurée par le serveur est joignable. */
export function localModelConfig() {
  const url = new URL(
    process.env.ASSISTANT_OLLAMA_URL || "http://127.0.0.1:11434",
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]", "ollama"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("ASSISTANT_OLLAMA_URL_DENIED");
  const model = process.env.ASSISTANT_OLLAMA_MODEL || "";
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(model) ||
    /cloud/i.test(model)
  )
    throw new Error("ASSISTANT_LOCAL_MODEL_REQUIRED");
  return { origin: url.origin, model };
}

async function localRequest(
  path: "/api/show" | "/api/chat",
  body: unknown,
  signal: AbortSignal,
) {
  const { origin } = localModelConfig();
  const response = await fetch(origin + path, {
    method: "POST",
    signal,
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("ASSISTANT_LOCAL_UNAVAILABLE");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ASSISTANT_LOCAL_INVALID");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 128_000) {
      await reader.cancel();
      throw new Error("ASSISTANT_LOCAL_TOO_LARGE");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

const metadataSchema = z
  .object({
    details: z.object({ format: z.literal("gguf") }),
    capabilities: z.array(z.string().max(80)).max(30),
  })
  .passthrough();
let probe:
  | {
      key: string;
      until: number;
      promise: Promise<z.infer<typeof metadataSchema>>;
    }
  | undefined;
export async function localMetadata() {
  const { origin, model } = localModelConfig();
  const key = origin + "/" + model;
  if (probe?.key === key && probe.until > Date.now()) return probe.promise;
  const entry = {
    key,
    until: Date.now() + 30_000,
    promise: (async () => {
      const metadata = metadataSchema.parse(
        await localRequest(
          "/api/show",
          { model, verbose: false },
          AbortSignal.timeout(3000),
        ),
      );
      if (
        !metadata.capabilities.includes("completion") ||
        metadata.remote_host ||
        metadata.remote_model
      )
        throw new Error("ASSISTANT_LOCAL_MODEL_REQUIRED");
      return metadata;
    })(),
  };
  probe = entry;
  try {
    return await entry.promise;
  } catch (error) {
    entry.until = Date.now() + 3000;
    throw error;
  }
}
export async function localModelReady() {
  try {
    await localMetadata();
    return true;
  } catch {
    return false;
  }
}

const functionCall = z.object({
  function: z.object({
    name: z.string().min(1).max(100),
    arguments: z.record(z.string(), z.unknown()),
  }),
});
const chatSchema = z.object({
  done: z.literal(true),
  done_reason: z.string().optional(),
  message: z.object({
    role: z.literal("assistant"),
    content: z.string().max(16000),
    tool_calls: z.array(functionCall).max(4).optional(),
  }),
});
export async function localChat(
  body: Record<string, unknown>,
  signal: AbortSignal,
  contextLength: 4096 | 8192 = 8192,
) {
  if (JSON.stringify(body).length > 24_000)
    throw new Error("ASSISTANT_LOCAL_CONTEXT_LIMIT");
  const { model } = localModelConfig();
  const metadata = await localMetadata();
  const result = chatSchema.parse(
    await localRequest(
      "/api/chat",
      {
        ...body,
        model,
        stream: false,
        ...(metadata.capabilities.includes("thinking") ? { think: false } : {}),
        keep_alive: "5m",
        options: { temperature: 0, num_ctx: contextLength, num_predict: 512 },
      },
      signal,
    ),
  );
  if (result.done_reason && result.done_reason !== "stop")
    throw new Error("ASSISTANT_LOCAL_INCOMPLETE");
  return result.message;
}
