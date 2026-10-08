import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { ApiError } from "../../middleware/errorHandler";
import type { Service } from "./registry";

export const surfaces = {
  one: { service: "ONE", category: "orientation" },
  eat: { service: "EAT", category: null },
  drive: { service: "DRIVE", category: null },
  "eat-manager": { service: "EAT", category: "restaurant" },
  "eat-delivery": { service: "EAT", category: "courier" },
  "drive-manager": { service: "DRIVE", category: "partner" },
  "drive-driver": { service: "DRIVE", category: "driver" },
  "one-manager": { service: "ONE", category: "orientation" },
} as const;
export type Surface = keyof typeof surfaces;
export function hostMapping(): Record<string, Surface> {
  const configured = process.env.ASSISTANT_HOSTS;
  const map = configured
    ? JSON.parse(configured)
    : process.env.NODE_ENV === "production"
      ? {}
      : { "localhost:3000": "one", "127.0.0.1:3000": "one" };
  if (!map || Array.isArray(map) || typeof map !== "object")
    throw new Error("ASSISTANT_HOSTS_INVALID");
  for (const [host, surface] of Object.entries(map)) {
    if (
      !/^[a-z0-9.-]+(?::\d+)?$/.test(host) ||
      !Object.hasOwn(surfaces, String(surface))
    )
      throw new Error("ASSISTANT_HOSTS_INVALID");
    if (
      process.env.NODE_ENV === "production" &&
      /^(localhost|127\.)/.test(host)
    )
      throw new Error("ASSISTANT_PRODUCTION_LOCALHOST");
  }
  return map;
}
function gatewaySecret() {
  const key = process.env.ASSISTANT_GATEWAY_SECRET;
  if (key && key.length >= 32) return key;
  if (process.env.NODE_ENV !== "production")
    return "zupone-local-development-only-gateway";
  throw new ApiError(
    503,
    "Assistant non configuré",
    "ASSISTANT_NOT_CONFIGURED",
  );
}
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export function signGateway(
  timestamp: string,
  host: string,
  surface: string,
  method: string,
  path: string,
  body: unknown,
  authorization: string,
  cookie: string,
) {
  return createHmac("sha256", gatewaySecret())
    .update(
      [
        timestamp,
        host,
        surface,
        method,
        path,
        digest(JSON.stringify(body ?? null)),
        digest(authorization + "\n" + cookie),
      ].join("\n"),
    )
    .digest("hex");
}
export function resolveContext(req: Request) {
  const timestamp = req.get("x-assistant-time") || "";
  const host = req.get("x-assistant-host") || "";
  const surface = req.get("x-assistant-surface") || "";
  const signature = req.get("x-assistant-signature") || "";
  const mapping = hostMapping();
  const expectedSurface = Object.hasOwn(mapping, host)
    ? mapping[host]
    : undefined;
  if (
    !expectedSurface ||
    expectedSurface !== surface ||
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp)) > 30_000 ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    throw new ApiError(
      403,
      "Contexte de site refusé",
      "ASSISTANT_CONTEXT_DENIED",
    );
  }
  const expected = signGateway(
    timestamp,
    host,
    surface,
    req.method,
    req.originalUrl,
    req.body,
    req.get("authorization") || "",
    req.get("cookie") || "",
  );
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
    throw new ApiError(
      403,
      "Contexte de site refusé",
      "ASSISTANT_CONTEXT_DENIED",
    );
  return {
    host,
    surface: expectedSurface,
    service: surfaces[expectedSurface].service as Service,
  };
}
export function retentionDays(anonymous = false) {
  const n = Number(
    anonymous
      ? process.env.ASSISTANT_GUEST_DAYS || 1
      : process.env.ASSISTANT_RETENTION_DAYS || 30,
  );
  if (!Number.isInteger(n) || n < 1 || n > 365)
    throw new Error("ASSISTANT_RETENTION_INVALID");
  return n;
}
