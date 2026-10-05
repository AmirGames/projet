import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { PermissionsPlateforme } from "../auth/permissions-plateforme.service";
import { limiterCadence } from "../../middleware/throttle";
import { resolveContext, surfaces } from "./context";
import { providerMode } from "./provider";
import {
  actorFrom,
  changeSelection,
  createConversation,
  listConversations,
  messageSchema,
  ownedConversation,
  publicConfig,
  publicConversation,
  requestHandoff,
  selectionSchema,
  sendMessage,
  withConversationOperation,
} from "./service";
import { confirmAction, executeTool, toolInputs } from "./tools";
import { redactSecrets } from "./registry";

const router = Router();
const ids = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const handle =
  (fn: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };

// Une autorisation annoncée mais périmée ne devient pas une session visiteur.
router.use((req, res, next) =>
  req.get("authorization") ? authMiddleware(req, res, next) : next(),
);
router.use(
  handle(async (req, res, next) => {
    resolveContext(req);
    providerMode(); // refuse notamment une simulation en production
    res.set("Cache-Control", "no-store");
    next();
  }),
);
router.use(
  limiterCadence({
    nom: "assistant-requests",
    max: 60,
    fenetreMs: 60000,
    cle: (req) => `${req.userId || req.ip}|${req.get("x-assistant-host")}`,
  }),
);
const actor = (
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
) => actorFrom(req, res, resolveContext(req).host);
const mutation = handle(async (req, _res, next) => {
  const context = resolveContext(req);
  const origin = req.get("origin");
  // Même origine exacte ; aucun cookie invité exploitable par un site tiers.
  const expected = `${process.env.NODE_ENV === "production" ? "https" : "http"}://${context.host}`;
  if (origin !== expected || !req.is("application/json"))
    throw new ApiError(
      403,
      "Origine ou format de requête refusé",
      "ASSISTANT_CSRF_DENIED",
    );
  if (JSON.stringify(req.body || {}).length > 12000)
    throw new ApiError(
      413,
      "Requête trop volumineuse",
      "ASSISTANT_INPUT_TOO_LARGE",
    );
  next();
});
router.use((req, res, next) =>
  ["POST", "PATCH", "DELETE"].includes(req.method)
    ? mutation(req, res, next)
    : next(),
);

router.get(
  "/config",
  handle(async (req, res) => {
    res.json(await publicConfig(actor(req, res), resolveContext(req).surface));
  }),
);
router.get(
  "/conversations",
  handle(async (req, res) => {
    res.json({ conversations: await listConversations(actor(req, res)) });
  }),
);
router.post(
  "/conversations",
  handle(async (req, res) => {
    z.object({}).strict().parse(req.body);
    const context = resolveContext(req);
    const a = actor(req, res);
    const c = await createConversation(
      a,
      context.service,
      surfaces[context.surface].category,
    );
    res.status(201).json(await publicConversation(a, c.id));
  }),
);
router.get(
  "/conversations/:id",
  handle(async (req, res) => {
    res.json(
      await publicConversation(actor(req, res), ids.parse(req.params.id)),
    );
  }),
);
router.patch(
  "/conversations/:id/context",
  handle(async (req, res) => {
    const a = actor(req, res);
    const c = await ownedConversation(a, ids.parse(req.params.id));
    await changeSelection(a, c, selectionSchema.parse(req.body));
    res.json(await publicConversation(a, c.id));
  }),
);
router.post(
  "/conversations/:id/messages",
  limiterCadence({
    nom: "assistant-messages",
    max: 15,
    fenetreMs: 60000,
    cle: (req) => `${req.userId || req.get("cookie") || req.ip}`,
  }),
  limiterCadence({
    nom: "assistant-ai-budget",
    max: Number(process.env.ASSISTANT_DAILY_MESSAGES || 1000),
    fenetreMs: 86400000,
    cle: () => "deployment",
    active: () => providerMode() === "real",
  }),
  handle(async (req, res) => {
    const a = actor(req, res);
    const c = await ownedConversation(a, ids.parse(req.params.id));
    await sendMessage(a, c, messageSchema.parse(req.body));
    res.json(await publicConversation(a, c.id));
  }),
);
router.post(
  "/conversations/:id/tools",
  handle(async (req, res) => {
    const schema = z
      .object({
        name: z.enum(Object.keys(toolInputs) as [string, ...string[]]),
        params: z.unknown(),
      })
      .strict();
    const input = schema.parse(req.body);
    const a = actor(req, res);
    const c = await ownedConversation(a, ids.parse(req.params.id));
    const result = await withConversationOperation(c, () =>
      executeTool(a, c, input.name, input.params),
    );
    res.json({ result, conversation: await publicConversation(a, c.id) });
  }),
);
router.post(
  "/conversations/:id/actions/:actionId/confirm",
  handle(async (req, res) => {
    z.object({}).strict().parse(req.body);
    const a = actor(req, res);
    const c = await ownedConversation(a, ids.parse(req.params.id));
    const action = await withConversationOperation(c, () =>
      confirmAction(a, c, ids.parse(req.params.actionId)),
    );
    res.json({ action, conversation: await publicConversation(a, c.id) });
  }),
);
router.post(
  "/conversations/:id/handoff",
  handle(async (req, res) => {
    const body = z
      .object({
        reason: z.string().trim().min(2).max(500),
        consent: z.literal(true),
      })
      .strict()
      .parse(req.body);
    const a = actor(req, res);
    const c = await ownedConversation(a, ids.parse(req.params.id));
    await withConversationOperation(c, () => requestHandoff(a, c, body.reason));
    res.status(201).json(await publicConversation(a, c.id));
  }),
);
router.delete(
  "/conversations/:id",
  handle(async (req, res) => {
    z.object({ confirmDeletion: z.literal(true) })
      .strict()
      .parse(req.body);
    const a = actor(req, res);
    const c = await ownedConversation(a, ids.parse(req.params.id));
    await withConversationOperation(c, async () => {
      const executing = await db.assistantAction.count({
        where: { conversationId: c.id, state: "EXECUTING" },
      });
      if (executing)
        throw new ApiError(
          409,
          "Une opération est encore en cours ; demandez un conseiller",
          "ASSISTANT_BUSY",
        );
      // L'ancien ticket métier suit sa propre politique de conservation.
      await db.assistantConversation.delete({ where: { id: c.id } });
    });
    res.status(204).end();
  }),
);

async function supportServices(
  req: Parameters<RequestHandler>[0],
  write = false,
) {
  if (!req.userId || !req.compte)
    throw new ApiError(401, "Connexion requise", "MISSING_AUTH");
  if (req.compte.isSuperOwner) return ["ONE", "EAT", "DRIVE"];
  if (!req.compte.isSystemAdmin) return [];
  const allowed: string[] = [];
  for (const service of ["EAT", "DRIVE"] as const) {
    const level = (
      await PermissionsPlateforme.permissionsDu(
        req.compte.acces[service],
        service,
      )
    )["support-tickets"];
    if (level && (!write || level === "write")) allowed.push(service);
  }
  return allowed;
}
router.get(
  "/admin/handoffs",
  handle(async (req, res) => {
    const services = await supportServices(req);
    if (!services.length)
      throw new ApiError(403, "Permission support requise", "FORBIDDEN");
    const handoffs = await db.assistantHandoff.findMany({
      where: {
        service: { in: services },
        conversation: { expiresAt: { gt: new Date() } },
      },
      select: {
        id: true,
        service: true,
        specialty: true,
        summary: true,
        priority: true,
        state: true,
        reply: true,
        ticketId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ handoffs });
  }),
);
router.patch(
  "/admin/handoffs/:id",
  handle(async (req, res) => {
    const body = z
      .object({
        state: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
        reply: z.string().trim().max(4000).optional(),
      })
      .strict()
      .parse(req.body);
    const services = await supportServices(req, true);
    const handoff = await db.assistantHandoff.findFirst({
      where: { id: ids.parse(req.params.id), service: { in: services } },
    });
    if (!handoff) throw new ApiError(404, "Demande introuvable", "NOT_FOUND");
    await db.$transaction(async (tx) => {
      await tx.assistantHandoff.update({
        where: { id: handoff.id },
        data: {
          state: body.state,
          ...(body.reply
            ? { reply: redactSecrets(body.reply), repliedBy: req.userId }
            : {}),
        },
      });
      await tx.systemAuditLog.create({
        data: {
          adminId: req.userId!,
          action: "ASSISTANT_HANDOFF_UPDATED",
          target: handoff.id,
          changes: { state: body.state, replyAdded: !!body.reply },
        },
      });
    });
    res.json({ state: body.state });
  }),
);
export default router;
