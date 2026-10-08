import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { AssistantConversation } from "@prisma/client";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { exigerBoutique, type Acteur } from "../auth/autorisation-boutique";
import { TicketMessageService } from "../support/ticket-message.service";
import {
  agentFor,
  agents,
  categories,
  deterministicRoute,
  redactSecrets,
  services,
  type Category,
  type Service,
} from "./registry";
import { hostMapping, retentionDays, surfaces, type Surface } from "./context";
import {
  degradedAnswer,
  configuredProvider,
  publicProviderStatus,
  providerMode,
  type ModelProvider,
} from "./provider";
import { definitionsFor, executeTool, reconcilePendingActions } from "./tools";
import { guideQuestions } from "./faq";

export type AssistantActor = Acteur & { host: string; guestHash?: string };
export function actorFrom(
  req: Request,
  res: Response,
  host: string,
): AssistantActor {
  let guestHash: string | undefined;
  if (!req.userId) {
    const cookieName =
      process.env.NODE_ENV === "production"
        ? "__Host-zup-assistant-guest"
        : "zup-assistant-guest";
    const value = req
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    const guest =
      value && /^[a-f0-9]{64}$/.test(value)
        ? value
        : randomBytes(32).toString("hex");
    if (guest !== value)
      res.cookie(cookieName, guest, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: retentionDays(true) * 86400000,
      });
    guestHash = createHash("sha256").update(guest).digest("hex");
  }
  return { userId: req.userId, compte: req.compte, host, guestHash };
}
function ownership(actor: AssistantActor) {
  if (actor.userId) return { ownerId: actor.userId };
  if (actor.guestHash) return { ownerId: null, guestHash: actor.guestHash };
  throw new ApiError(401, "Session requise", "MISSING_AUTH");
}
export async function ownedConversation(actor: AssistantActor, id: string) {
  const conversation = await db.assistantConversation.findFirst({
    where: {
      id,
      host: actor.host,
      ...ownership(actor),
      expiresAt: { gt: new Date() },
    },
  });
  if (!conversation)
    throw new ApiError(
      404,
      "Conversation introuvable ou expirée",
      "ASSISTANT_NOT_FOUND",
    );
  if (conversation.storeId)
    await exigerBoutique(actor, conversation.storeId, "read");
  return conversation;
}
async function authorizedCategories(actor: Acteur) {
  if (!actor.userId) return [] as Category[];
  const [membership, courier, driver, company] = await Promise.all([
    db.membership.findFirst({
      where: { userId: actor.userId },
      select: { id: true },
    }),
    db.courier.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    }),
    db.chauffeurDrive.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    }),
    db.societeDrive.findUnique({
      where: { gerantId: actor.userId },
      select: { id: true },
    }),
  ]);
  return [
    "customer",
    "passenger",
    ...(membership ? ["restaurant"] : []),
    ...(courier ? ["courier"] : []),
    ...(driver ? ["driver"] : []),
    ...(company ? ["partner"] : []),
  ] as Category[];
}
/** Verrou atomique partagé avec les messages et changements de contexte. */
export async function withConversationOperation<T>(
  c: AssistantConversation,
  work: () => Promise<T>,
): Promise<T> {
  const now = new Date();
  const claimed = await db.assistantConversation.updateMany({
    where: {
      id: c.id,
      revision: c.revision,
      OR: [{ busyUntil: null }, { busyUntil: { lt: now } }],
    },
    data: {
      busyUntil: new Date(now.getTime() + 60_000),
      revision: { increment: 1 },
    },
  });
  if (!claimed.count)
    throw new ApiError(
      409,
      "Une opération est en cours. Réessayez après son résultat.",
      "ASSISTANT_BUSY",
    );
  try {
    return await work();
  } finally {
    await db.assistantConversation.updateMany({
      where: { id: c.id, revision: c.revision + 1 },
      data: { busyUntil: null },
    });
  }
}
const labels: Record<string, string> = {
  ONE: "ZupOne",
  EAT: "ZupEat",
  DRIVE: "ZupDrive",
};
export async function publicConfig(actor: AssistantActor, surface: Surface) {
  const service = surfaces[surface].service;
  const authorized = await authorizedCategories(actor);
  const suggested = surfaces[surface].category;
  const verifiedCategory =
    suggested &&
    (suggested === "orientation" || authorized.includes(suggested)) &&
    agents.some(
      (a) => a.enabled && a.service === service && a.category === suggested,
    )
      ? suggested
      : null;
  const professional =
    surface.includes("manager") ||
    surface === "eat-delivery" ||
    surface === "drive-driver";
  const welcome =
    service === "ONE"
      ? "Bonjour 👋 Je suis l’assistant IA ZupOne. Votre demande concerne quel service ?"
      : `Bonjour 👋 Je suis l’assistant IA ZupOne pour ${labels[service]}. Comment puis-je vous aider ?`;
  return {
    name: "Assistant ZupOne",
    service,
    surface,
    ...(await publicProviderStatus()),
    guideQuestions: guideQuestions(),
    authenticated: !!actor.userId,
    welcome:
      professional && actor.userId && verifiedCategory
        ? `${welcome} Votre contexte ${agentFor(service, verifiedCategory).label} est présélectionné selon votre compte connecté ; vous pouvez en choisir un autre.`
        : welcome,
    suggestedCategory: verifiedCategory,
    authorizedCategories: authorized,
    categories: agents
      .filter((a) => a.enabled)
      .map((a) => ({
        id: a.category,
        service: a.service,
        agentId: a.id,
        label: a.label,
      })),
    capabilities: {
      attachments: false,
      streaming: false,
      refunds: false,
      eatCancellation: false,
      privateKnowledge: false,
      drivePayments: false,
      financialActions: false,
      human: true,
    },
    privacyUrl: safePrivacyUrl(),
    retentionDays: retentionDays(!actor.userId),
  };
}
function safePrivacyUrl() {
  const configured = process.env.ASSISTANT_PRIVACY_URL || "/confidentialite";
  if (/^\/(?!\/)[a-zA-Z0-9/_-]+$/.test(configured)) return configured;
  try {
    const url = new URL(configured);
    if (url.protocol === "https:" && hostMapping()[url.host])
      return url.toString();
  } catch {
    /* refus */
  }
  throw new Error("ASSISTANT_PRIVACY_URL_INVALID");
}
export async function createConversation(
  actor: AssistantActor,
  service: Service,
  suggestedCategory: Category | null,
) {
  const allowed = await authorizedCategories(actor);
  const category =
    suggestedCategory &&
    (suggestedCategory === "orientation" ||
      allowed.includes(suggestedCategory)) &&
    agents.some(
      (a) =>
        a.enabled && a.service === service && a.category === suggestedCategory,
    )
      ? suggestedCategory
      : null;
  return db.assistantConversation.create({
    data: {
      ownerId: actor.userId || null,
      guestHash: actor.userId ? null : actor.guestHash,
      host: actor.host,
      service,
      category,
      agentId: category ? agentFor(service, category).id : null,
      expiresAt: new Date(Date.now() + retentionDays(!actor.userId) * 86400000),
    },
  });
}
export async function listConversations(actor: AssistantActor) {
  return db.assistantConversation.findMany({
    where: {
      host: actor.host,
      ...ownership(actor),
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      service: true,
      category: true,
      state: true,
      updatedAt: true,
      expiresAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
}
export async function publicConversation(actor: AssistantActor, id: string) {
  const c = await ownedConversation(actor, id);
  await reconcilePendingActions(actor, c);
  const store = c.storeId
    ? await db.store.findUnique({
        where: { id: c.storeId },
        select: { name: true },
      })
    : null;
  const [messages, actions, handoffs] = await Promise.all([
    db.assistantMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        author: true,
        content: true,
        service: true,
        agentId: true,
        segment: true,
        state: true,
        mode: true,
        createdAt: true,
      },
    }),
    db.assistantAction.findMany({
      where: { conversationId: id, segment: c.segment },
      take: 20,
      select: {
        id: true,
        summary: true,
        expiresAt: true,
        state: true,
        result: true,
      },
    }),
    db.assistantHandoff.findMany({
      where: { conversationId: id },
      take: 20,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        service: true,
        specialty: true,
        state: true,
        ticketId: true,
        reply: true,
        segment: true,
      },
    }),
  ]);
  for (const handoff of handoffs) {
    if (!handoff.ticketId) continue;
    const response = await db.ticketMessage.findFirst({
      where: { ticketId: handoff.ticketId, authorRole: "ADMIN" },
      select: { body: true },
      orderBy: { createdAt: "desc" },
    });
    if (response) handoff.reply = redactSecrets(response.body);
  }
  return {
    id: c.id,
    service: c.service,
    category: c.category,
    specialty: agents.find((a) => a.id === c.agentId)?.label || "Orientation",
    storeId: c.storeId,
    storeName: store?.name || null,
    state: c.state,
    segment: c.segment,
    expiresAt: c.expiresAt,
    messages: messages.reverse(),
    actions,
    handoffs,
  };
}
export const selectionSchema = z
  .object({
    service: z.enum(services),
    category: z.enum(categories).nullable(),
    storeId: z.string().min(1).max(100).optional(),
  })
  .strict();
export async function changeSelection(
  actor: AssistantActor,
  c: AssistantConversation,
  input: z.infer<typeof selectionSchema>,
) {
  const agent = input.category ? agentFor(input.service, input.category) : null;
  const store = input.storeId
    ? await exigerBoutique(actor, input.storeId, "read")
    : null;
  if (store && (input.service !== "EAT" || input.category !== "restaurant"))
    throw new ApiError(
      400,
      "Établissement incompatible avec ce contexte",
      "ASSISTANT_CONTEXT_INVALID",
    );
  const now = new Date();
  await db.$transaction(async (tx) => {
    const changed = await tx.assistantConversation.updateMany({
      where: {
        id: c.id,
        revision: c.revision,
        OR: [{ busyUntil: null }, { busyUntil: { lt: now } }],
      },
      data: {
        service: input.service,
        category: input.category,
        agentId: agent?.id || null,
        storeId: store?.id || null,
        orgId: store?.orgId || null,
        segment: { increment: 1 },
        revision: { increment: 1 },
        state: "OPEN",
        busyUntil: null,
      },
    });
    if (!changed.count)
      throw new ApiError(
        409,
        "Conversation en cours de traitement. Réessayez après sa réponse.",
        "ASSISTANT_BUSY",
      );
    await tx.assistantAction.updateMany({
      where: { conversationId: c.id, state: "PENDING" },
      data: { state: "CANCELLED" },
    });
    await tx.assistantMessage.create({
      data: {
        conversationId: c.id,
        clientKey: crypto.randomUUID(),
        author: "SYSTEM",
        content: `Contexte ${labels[input.service]}${agent ? ` — ${agent.label}` : ""}. Les données privées du contexte précédent ne sont pas transmises à cet agent.`,
        service: input.service,
        agentId: agent?.id,
        segment: c.segment + 1,
        mode: providerMode(),
      },
    });
  });
  return ownedConversation(actor, c.id);
}

export async function requestHandoff(
  actor: AssistantActor,
  c: AssistantConversation,
  reason: string,
  urgent = false,
) {
  if (
    actor.userId &&
    (await db.membership.findFirst({
      where: { userId: actor.userId, org: { isDemo: true } },
      select: { id: true },
    }))
  ) {
    throw new ApiError(
      403,
      "Le compte de démonstration ne peut pas transmettre de demande au support",
      "DEMO_ACCOUNT",
    );
  }
  const existing = await db.assistantHandoff.findUnique({
    where: {
      conversationId_segment: { conversationId: c.id, segment: c.segment },
    },
  });
  if (existing) return existing;
  const safeReason = redactSecrets(reason).slice(0, 500);
  const specialty =
    agents.find((a) => a.id === c.agentId)?.label || "Orientation";
  // Aucun historique, document ou résultat privé n'est copié au support.
  const summary = `${labels[c.service]} — ${specialty}\nIdentité ${actor.userId ? "vérifiée par session" : "non vérifiée"}\nMotif déclaré : ${safeReason}\nFaits confirmés : demande de conseiller enregistrée.\nActions : aucune action métier attestée dans ce résumé.\nProchaine étape : examiner la demande et répondre dans le support.\nUrgence : ${urgent ? "signalée, à évaluer" : "normale"}.`;
  let orgId: string | null = null;
  if (c.orgId && c.storeId && actor.userId) {
    await exigerBoutique(actor, c.storeId, "read");
    // Un ticket marchand est partagé par organisation dans le support existant.
    // Il reçoit seulement ce résumé sans données de commandes/établissements.
    const membership = await db.membership.findFirst({
      where: { orgId: c.orgId, userId: actor.userId },
      select: { id: true },
    });
    if (membership) orgId = c.orgId;
  }
  const handoff = await db.$transaction(
    async (tx) => {
      const prior = await tx.assistantHandoff.findUnique({
        where: {
          conversationId_segment: { conversationId: c.id, segment: c.segment },
        },
      });
      if (prior) return prior;
      const ticket = orgId
        ? await tx.merchantTicket.create({
            data: {
              orgId,
              title: `Assistant ZupOne — ${specialty}`,
              description: summary,
              category: "OTHER",
              priority: urgent ? "HIGH" : "MEDIUM",
            },
          })
        : null;
      const created = await tx.assistantHandoff.create({
        data: {
          conversationId: c.id,
          segment: c.segment,
          service: c.service,
          specialty,
          reason: safeReason,
          summary,
          verified: !!actor.userId,
          priority: urgent ? "HIGH" : "MEDIUM",
          ticketId: ticket?.id,
        },
      });
      await tx.assistantConversation.update({
        where: { id: c.id },
        data: { state: "HUMAN_REQUESTED" },
      });
      return created;
    },
    { isolationLevel: "Serializable" },
  );
  if (handoff.ticketId)
    await TicketMessageService.notifierOuvertureDeTicket(
      handoff.ticketId,
    ).catch(() => undefined);
  return handoff;
}

export const messageSchema = z
  .object({
    content: z.string().trim().min(1).max(4000),
    clientKey: z.string().uuid(),
  })
  .strict();
export async function sendMessage(
  actor: AssistantActor,
  c: AssistantConversation,
  input: z.infer<typeof messageSchema>,
  provider: ModelProvider = configuredProvider(),
) {
  const prior = await db.assistantMessage.findUnique({
    where: {
      conversationId_clientKey_author: {
        conversationId: c.id,
        clientKey: input.clientKey,
        author: "ASSISTANT",
      },
    },
  });
  if (prior) return prior;
  const now = new Date();
  const claimed = await db.assistantConversation.updateMany({
    where: {
      id: c.id,
      revision: c.revision,
      OR: [{ busyUntil: null }, { busyUntil: { lt: now } }],
    },
    data: {
      busyUntil: new Date(now.getTime() + 40_000),
      revision: { increment: 1 },
    },
  });
  if (!claimed.count)
    throw new ApiError(409, "Réponse en cours", "ASSISTANT_BUSY");
  const claimRevision = c.revision + 1;
  const content = redactSecrets(input.content);
  let mode = providerMode();
  let answer: string;
  let messageState = "COMPLETE";
  try {
    const count = await db.assistantMessage.count({
      where: { conversationId: c.id, author: "USER" },
    });
    if (count >= 100)
      throw new ApiError(
        429,
        "Limite de cette conversation atteinte. Ouvrez une nouvelle conversation.",
        "ASSISTANT_MESSAGE_LIMIT",
      );
    await db.assistantMessage.upsert({
      where: {
        conversationId_clientKey_author: {
          conversationId: c.id,
          clientKey: input.clientKey,
          author: "USER",
        },
      },
      create: {
        conversationId: c.id,
        clientKey: input.clientKey,
        author: "USER",
        content,
        service: c.service,
        agentId: c.agentId,
        segment: c.segment,
        mode,
      },
      update: {},
    });
    const route = deterministicRoute(
      content,
      c.service as Service,
      c.category as Category | null,
    );
    if (
      content.includes("[secret masqué]") ||
      content.includes("[numéro sensible masqué]") ||
      content.includes("[coordonnée bancaire masquée]")
    ) {
      answer =
        "Une information sensible a été masquée avant enregistrement et transmission. Ne partagez pas de secret dans le chat ; utilisez le portail sécurisé. Si une clé ou un mot de passe a été exposé, remplacez-le via le parcours sécurisé.";
    } else if (route.type === "emergency") {
      answer =
        "En cas de danger immédiat ou de blessure, contactez les secours locaux : 112 en Belgique et dans l’Union européenne. Si vous conduisez, arrêtez-vous en sécurité avant de manipuler le chat. Vous pouvez aussi demander un conseiller ; ce chat n’est pas un service d’urgence.";
    } else if (route.type === "privacy") {
      answer =
        "Vous pouvez supprimer cet historique avec « Supprimer cette conversation ». Pour l’accès, la rectification ou la suppression des données de compte, utilisez votre profil ou le parcours /suppression-compte, ou demandez un conseiller. Une nouvelle conversation conserve les anciennes jusqu’à leur expiration.";
    } else if (route.type === "human") {
      const handoff = await requestHandoff(
        actor,
        c,
        "Demande explicite de conseiller ou contestation nécessitant examen humain",
      );
      answer = `Votre demande de conseiller est enregistrée sous la référence ${handoff.id}${handoff.ticketId ? ` (ticket ${handoff.ticketId})` : ""}. Vous pourrez consulter la réponse dans cette conversation. Aucun délai de réponse n’est confirmé.`;
    } else if (route.type === "service") {
      answer = `Votre demande semble concerner ${labels[route.service]}. Choisissez « Changer de service » pour confirmer ce contexte ; les données privées du service actuel ne seront pas transmises.`;
    } else {
      let agent = c.agentId
        ? agents.find((a) => a.enabled && a.id === c.agentId) || null
        : route.type === "agent"
          ? route.agent
          : null;
      if (!agent && mode === "real") {
        try {
          const suggested = await provider.classify(
            c.service as Service,
            content,
          );
          const candidate = agents.find(
            (a) =>
              a.enabled &&
              a.id === suggested.suggestedAgentId &&
              a.service === c.service &&
              a.service === suggested.service,
          );
          if (
            candidate &&
            !suggested.needsClarification &&
            !suggested.needsHuman
          )
            agent = candidate;
        } catch {
          /* classification facultative : clarification déterministe */
        }
      }
      if (agent && !c.agentId) {
        // Aucun document privé ni outil exécuté avant ce choix contrôlé.
        c = await db.assistantConversation.update({
          where: { id: c.id },
          data: { category: agent.category, agentId: agent.id },
        });
      }
      if (!agent)
        answer =
          "Votre demande concerne quel service et quel support ? Choisissez une catégorie ci-dessous.";
      else {
        const guidedReply = async () => {
          const previous = await db.assistantMessage.findFirst({
            where: {
              conversationId: c.id,
              segment: c.segment,
              author: "USER",
              clientKey: { not: input.clientKey },
            },
            select: { content: true },
            orderBy: { createdAt: "desc" },
          });
          return degradedAnswer(agent, content, mode, {
            authenticated: !!actor.userId,
            storeSelected: !!c.storeId,
            previousQuestion: previous?.content,
          });
        };
        if (mode !== "real") answer = await guidedReply();
        else {
          const history = await db.assistantMessage.findMany({
            where: {
              conversationId: c.id,
              segment: c.segment,
              author: { in: ["USER", "ASSISTANT"] },
            },
            orderBy: { createdAt: "desc" },
            take: 12,
            select: { author: true, content: true },
          });
          let proposed = false;
          let toolFailed = false;
          try {
            answer = await provider.respond(
              agent,
              history.reverse(),
              actor.userId ? definitionsFor(c) : [],
              async (name, args) => {
                try {
                  const result = await executeTool(actor, c, name, args);
                  if (name.startsWith("prepare_")) proposed = true;
                  return result;
                } catch (error) {
                  toolFailed = true;
                  return {
                    status: "FAILED",
                    code:
                      error instanceof ApiError
                        ? error.code
                        : "TOOL_UNAVAILABLE",
                    message:
                      "Aucun succès confirmé. L’accès ou le service est indisponible.",
                  };
                }
              },
            );
            if (proposed)
              answer =
                "Une proposition attend votre confirmation dans le panneau ci-dessous. Aucune modification n’a encore été exécutée.";
            else if (toolFailed)
              answer =
                "Je n’ai pas pu obtenir de résultat autorisé confirmé. Aucune action réussie n’est attestée. Vérifiez votre contexte ou demandez un conseiller.";
          } catch {
            mode = "degraded";
            messageState = "DEGRADED";
            answer =
              (await guidedReply()) +
              "\n\nLe fournisseur IA n’a pas confirmé de réponse. Les actions proposées et le relais humain restent disponibles.";
          }
        }
      }
    }
    const message = await db.$transaction(async (tx) => {
      const stillOwned = await tx.assistantConversation.findFirst({
        where: {
          id: c.id,
          revision: claimRevision,
          segment: c.segment,
          ...ownership(actor),
        },
      });
      if (!stillOwned)
        throw new ApiError(409, "Le contexte a changé", "ASSISTANT_BUSY");
      const message = await tx.assistantMessage.create({
        data: {
          conversationId: c.id,
          clientKey: input.clientKey,
          author: "ASSISTANT",
          content: redactSecrets(answer).slice(0, 8000),
          service: c.service,
          agentId: c.agentId,
          segment: c.segment,
          mode,
          state: messageState,
        },
      });
      await tx.assistantConversation.update({
        where: { id: c.id },
        data: { busyUntil: null },
      });
      return message;
    });
    return message;
  } finally {
    await db.assistantConversation.updateMany({
      where: { id: c.id, revision: claimRevision },
      data: { busyUntil: null },
    });
  }
}
