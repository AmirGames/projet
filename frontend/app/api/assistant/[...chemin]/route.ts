import { NextRequest } from "next/server";
import { relayAssistant } from "@/lib/assistant-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ chemin: string[] }> };
const relay = async (req: NextRequest, { params }: Context) =>
  relayAssistant(req, (await params).chemin);
export { relay as GET, relay as POST, relay as PATCH, relay as DELETE };
