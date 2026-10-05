import { createHash, createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const SURFACES = [
  "one",
  "eat",
  "drive",
  "eat-manager",
  "eat-delivery",
  "drive-manager",
  "drive-driver",
  "one-manager",
];
export function assistantHosts(): Record<string, string> {
  const map = process.env.ASSISTANT_HOSTS
    ? JSON.parse(process.env.ASSISTANT_HOSTS)
    : process.env.NODE_ENV === "production"
      ? {}
      : { "localhost:3000": "one", "127.0.0.1:3000": "one" };
  if (!map || typeof map !== "object" || Array.isArray(map))
    throw new Error("ASSISTANT_HOSTS_INVALID");
  for (const [host, surface] of Object.entries(map)) {
    if (
      !/^[a-z0-9.-]+(?::\d+)?$/.test(host) ||
      !SURFACES.includes(String(surface))
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
export async function relayAssistant(req: NextRequest, parts: string[]) {
  // Caddy accepte seulement DOMAINES_SITE ; Host doit être une entrée explicite.
  // Ni X-Forwarded-Host, ni brand/context fourni par le client ne sont retenus.
  const host = (req.headers.get("host") || "").toLowerCase();
  const hosts = assistantHosts();
  const surface = Object.hasOwn(hosts, host) ? hosts[host] : undefined;
  let key = process.env.ASSISTANT_GATEWAY_SECRET;
  if ((!key || key.length < 32) && process.env.NODE_ENV !== "production")
    key = "zupone-local-development-only-gateway";
  if (!surface || !key || key.length < 32)
    return NextResponse.json(
      {
        error: "Assistant non configuré pour ce site",
        code: "ASSISTANT_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  if (
    parts.some((p) => !/^[a-zA-Z0-9_-]{1,100}$/.test(p)) ||
    parts.length > 6 ||
    req.nextUrl.search
  )
    return NextResponse.json({ error: "Chemin refusé" }, { status: 400 });
  const mutates = !["GET", "HEAD"].includes(req.method);
  const expectedOrigin = `${process.env.NODE_ENV === "production" ? "https" : "http"}://${host}`;
  if (
    mutates &&
    (req.headers.get("origin") !== expectedOrigin ||
      req.headers.get("content-type")?.split(";")[0] !== "application/json")
  )
    return NextResponse.json(
      { error: "Origine ou format refusé" },
      { status: 403 },
    );
  let body: unknown = null;
  if (mutates) {
    const reader = req.body?.getReader();
    if (!reader)
      return NextResponse.json({ error: "Corps requis" }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 12000) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Message trop volumineux" },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
    }
  }
  const path = "/api/assistant/" + parts.map(encodeURIComponent).join("/");
  const timestamp = String(Date.now());
  const authorization = req.headers.get("authorization") || "";
  // Seule la session visiteur de ce domaine passe ici ; aucun cookie de SSO.
  const name =
    process.env.NODE_ENV === "production"
      ? "__Host-zup-assistant-guest"
      : "zup-assistant-guest";
  const guest = req.cookies.get(name)?.value;
  const cookie =
    guest && /^[a-f0-9]{64}$/.test(guest) ? `${name}=${guest}` : "";
  const digest = (s: string) => createHash("sha256").update(s).digest("hex");
  const signature = createHmac("sha256", key)
    .update(
      [
        timestamp,
        host,
        surface,
        req.method,
        path,
        digest(JSON.stringify(body)),
        digest(authorization + "\n" + cookie),
      ].join("\n"),
    )
    .digest("hex");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-assistant-time": timestamp,
    "x-assistant-host": host,
    "x-assistant-surface": surface,
    "x-assistant-signature": signature,
    ...(authorization ? { authorization } : {}),
    ...(cookie ? { cookie } : {}),
    ...(mutates ? { origin: expectedOrigin } : {}),
  };
  // Aucune IP annoncée par le navigateur n'est transmise : la limite générale
  // utilise l'IP du relais ; les messages sont aussi limités par session/utilisateur.
  const internal =
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001";
  try {
    const response = await fetch(internal.replace(/\/$/, "") + path, {
      method: req.method,
      headers,
      body: mutates ? JSON.stringify(body) : undefined,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(35000),
    });
    const result = new NextResponse(response.body, { status: response.status });
    result.headers.set(
      "Content-Type",
      response.headers.get("content-type") || "application/json",
    );
    result.headers.set("Cache-Control", "no-store");
    for (const cookie of response.headers.getSetCookie())
      result.headers.append("set-cookie", cookie);
    return result;
  } catch {
    return NextResponse.json(
      {
        error:
          "Assistant temporairement injoignable. Reconnectez-vous au service ; vérifiez l’état d’une action avant de réessayer.",
        code: "ASSISTANT_UNAVAILABLE",
      },
      { status: 502 },
    );
  }
}
