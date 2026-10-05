import { z } from "zod";
import type { AssistantConversation, Prisma } from "@prisma/client";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import {
  exigerBoutique,
  perimetreBoutiques,
  type Acteur,
} from "../auth/autorisation-boutique";
import { preparerJour, NOM_DU_JOUR } from "../delivery/store-hours.service";
import { CourseDriveService } from "../zupdrive/course-drive.service";
import {
  agentFor,
  type Service,
  type Category,
  redactSecrets,
} from "./registry";
import type { ToolDefinition } from "./provider";
import { OrderStatus, PaymentStatus } from "@prisma/client";

const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const object = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const empty = object({});
export const toolInputs = {
  my_orders: empty,
  read_order: object({ orderId: id }),
  my_stores: empty,
  store_products: object({ storeId: id }),
  store_orders: object({ storeId: id }),
  store_hours: object({ storeId: id }),
  my_deliveries: empty,
  my_rides: empty,
  read_ride: object({ rideId: id }),
  prepare_availability: object({ productId: id, available: z.boolean() }),
  prepare_hours: object({
    storeId: id,
    day: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
    closed: z.boolean(),
    plages: z
      .array(
        object({
          open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        }),
      )
      .max(4),
  }),
  prepare_ride_cancellation: object({ rideId: id }),
};
export type ToolName = keyof typeof toolInputs;
const timestamp = z.iso.datetime();
const label = z.string().max(500);
const amount = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?$/)
  .max(40);
const orderOutput = object({
  id,
  status: z.enum(OrderStatus),
  paymentStatus: z.enum(PaymentStatus),
  totalAmount: amount,
  createdAt: timestamp,
  store: object({ name: label }),
});
const rideOutput = object({
  id,
  statut: z.string().min(1).max(40),
  prixCentimes: z.number().int().nonnegative(),
  devise: z.string().length(3),
  createdAt: timestamp,
});
const hour = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dayOutput = object({
  closed: z.boolean(),
  open: hour.optional(),
  close: hour.optional(),
  plages: z
    .array(object({ open: hour, close: hour }))
    .max(4)
    .optional(),
});
const proposalOutput = object({
  id,
  summary: z.string().max(2000),
  expiresAt: timestamp,
  state: z.literal("PENDING"),
});
/** Liste fermée des champs transmissibles à l'IA et au navigateur. */
export const toolOutputs = {
  my_orders: z.array(orderOutput).max(20),
  read_order: orderOutput,
  my_stores: z.array(object({ id, name: label })).max(50),
  store_products: z
    .array(object({ id, name: label, isAvailable: z.boolean() }))
    .max(100),
  store_orders: z
    .array(object({ id, status: z.enum(OrderStatus), createdAt: timestamp }))
    .max(20),
  store_hours: object({
    id,
    name: label,
    isOpen: z.boolean(),
    operatingHours: object({
      MON: dayOutput.optional(),
      TUE: dayOutput.optional(),
      WED: dayOutput.optional(),
      THU: dayOutput.optional(),
      FRI: dayOutput.optional(),
      SAT: dayOutput.optional(),
      SUN: dayOutput.optional(),
    }),
  }),
  my_deliveries: z
    .array(
      object({
        id,
        orderId: id,
        status: z.string().min(1).max(40),
        driverPayout: amount.nullable(),
        distanceKm: z.number().nonnegative().nullable(),
      }),
    )
    .max(20),
  my_rides: z.array(rideOutput).max(20),
  read_ride: rideOutput,
  prepare_availability: proposalOutput,
  prepare_hours: proposalOutput,
  prepare_ride_cancellation: proposalOutput,
} satisfies Record<ToolName, z.ZodType>;
const descriptions: Record<ToolName, string> = {
  my_orders: "Liste les commandes du client connecté uniquement.",
  read_order: "Lit le statut et le paiement de sa propre commande.",
  my_stores: "Liste les établissements autorisés.",
  store_products: "Catalogue minimal d’un établissement autorisé.",
  store_orders:
    "Statut des commandes d’un établissement autorisé, sans coordonnées clients.",
  store_hours: "Horaires actuels d’un établissement autorisé.",
  my_deliveries:
    "Courses attribuées et gains personnels du livreur connecté uniquement, sans coordonnées clients.",
  my_rides:
    "Courses du contexte actif : passager, chauffeur attribué ou société dont le compte est gérant.",
  read_ride:
    "Statut minimal d’une course autorisée, sans identité du chauffeur ou du passager.",
  prepare_availability:
    "Propose une disponibilité ; n’exécute rien avant confirmation enregistrée.",
  prepare_hours:
    "Propose les horaires d’un jour d’un établissement précis ; n’exécute rien avant confirmation enregistrée.",
  prepare_ride_cancellation:
    "Propose l’annulation de sa course passager avant son début ; confirmation requise.",
};
export function definitionsFor(
  conversation: AssistantConversation,
): ToolDefinition[] {
  if (!conversation.category || !conversation.agentId) return [];
  return agentFor(
    conversation.service as Service,
    conversation.category as Category,
  ).tools.map((name) => {
    const schema = toolInputs[name as ToolName];
    return {
      type: "function",
      name,
      description: descriptions[name as ToolName],
      strict: true,
      parameters: z.toJSONSchema(schema) as Record<string, unknown>,
    };
  });
}
function authenticated(actor: Acteur) {
  if (!actor.userId)
    throw new ApiError(
      401,
      "Connectez-vous pour accéder à vos données",
      "MISSING_AUTH",
    );
  return actor.userId;
}
const orderSelect = {
  id: true,
  status: true,
  paymentStatus: true,
  totalAmount: true,
  createdAt: true,
  store: { select: { name: true } },
} as const;
const rideSelect = {
  id: true,
  statut: true,
  prixCentimes: true,
  devise: true,
  createdAt: true,
} as const;
async function rideScope(
  actor: Acteur,
  conversation: AssistantConversation,
): Promise<Prisma.CourseDriveWhereInput> {
  const userId = authenticated(actor);
  if (conversation.category === "passenger") return { passagerId: userId };
  if (conversation.category === "driver") {
    const driver = await db.chauffeurDrive.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (driver) return { chauffeurId: driver.id };
  }
  if (conversation.category === "partner") {
    const company = await db.societeDrive.findUnique({
      where: { gerantId: userId },
      select: { id: true },
    });
    if (company) return { societeId: company.id };
  }
  throw new ApiError(403, "Ce contexte ne vous est pas autorisé", "FORBIDDEN");
}
async function manageable(actor: Acteur, storeId: string) {
  const store = await exigerBoutique(actor, storeId, "manage");
  const org = await db.organization.findUnique({
    where: { id: store.orgId },
    select: { status: true, isDemo: true },
  });
  if (!org || org.status !== "ACTIVE" || org.isDemo)
    throw new ApiError(
      403,
      "Les modifications de cet établissement ne sont pas autorisées",
      "ACCOUNT_RESTRICTED",
    );
  return store;
}
async function prepare(
  actor: Acteur,
  conversation: AssistantConversation,
  tool: ToolName,
  params: Prisma.InputJsonValue,
  target: string,
  summary: string,
) {
  return db.assistantAction.create({
    data: {
      conversationId: conversation.id,
      actorId: authenticated(actor),
      tool,
      params,
      target,
      summary: redactSecrets(summary),
      segment: conversation.segment,
      expiresAt: new Date(Date.now() + 5 * 60_000),
      idempotencyKey: crypto.randomUUID(),
    },
    select: { id: true, summary: true, expiresAt: true, state: true },
  });
}
type ToolOutput<T extends string> = T extends ToolName
  ? z.infer<(typeof toolOutputs)[T]>
  : unknown;
export async function executeTool<T extends string>(
  actor: Acteur,
  conversation: AssistantConversation,
  name: T,
  input: unknown,
): Promise<ToolOutput<T>> {
  const allowed = definitionsFor(conversation).some((t) => t.name === name);
  if (!allowed || !(name in toolInputs))
    throw new ApiError(
      403,
      "Outil non autorisé pour cette spécialité",
      "ASSISTANT_TOOL_DENIED",
    );
  const tool = name as ToolName;
  const params = toolInputs[tool].parse(input) as Record<string, unknown>;
  const userId = authenticated(actor);
  let target: string | undefined;
  const startedAt = new Date();
  try {
    let result: unknown;
    switch (tool) {
      case "my_orders":
        result = await db.order.findMany({
          where: { customer: { userId, deletedAt: null }, deletedAt: null },
          select: orderSelect,
          orderBy: { createdAt: "desc" },
          take: 20,
        });
        break;
      case "read_order": {
        target = String(params.orderId);
        result = await db.order.findFirst({
          where: {
            id: target,
            customer: { userId, deletedAt: null },
            deletedAt: null,
          },
          select: orderSelect,
        });
        if (!result)
          throw new ApiError(404, "Commande introuvable", "NOT_FOUND");
        break;
      }
      case "my_stores":
        result = await db.store.findMany({
          where: {
            AND: [{ deletedAt: null }, await perimetreBoutiques(actor)],
          },
          select: { id: true, name: true },
          take: 50,
          orderBy: { name: "asc" },
        });
        break;
      case "store_products":
      case "store_orders":
      case "store_hours": {
        target = String(params.storeId);
        if (conversation.storeId !== target)
          throw new ApiError(
            403,
            "Sélectionnez cet établissement dans le contexte avant de consulter ses données",
            "ASSISTANT_STORE_CONTEXT_REQUIRED",
          );
        await exigerBoutique(actor, target, "read");
        if (tool === "store_products")
          result = await db.product.findMany({
            where: { storeId: target, deletedAt: null },
            select: { id: true, name: true, isAvailable: true },
            take: 100,
            orderBy: { name: "asc" },
          });
        else if (tool === "store_orders")
          result = await db.order.findMany({
            where: { storeId: target, deletedAt: null },
            select: { id: true, status: true, createdAt: true },
            take: 20,
            orderBy: { createdAt: "desc" },
          });
        else
          result = await db.store.findUnique({
            where: { id: target },
            select: {
              id: true,
              name: true,
              operatingHours: true,
              isOpen: true,
            },
          });
        break;
      }
      case "my_deliveries": {
        const courier = await db.courier.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (!courier)
          throw new ApiError(403, "Compte livreur requis", "FORBIDDEN");
        result = await db.orderDelivery.findMany({
          where: { driverId: courier.id },
          select: {
            id: true,
            orderId: true,
            status: true,
            driverPayout: true,
            distanceKm: true,
          },
          take: 20,
          orderBy: { createdAt: "desc" },
        });
        break;
      }
      case "my_rides":
        result = await db.courseDrive.findMany({
          where: await rideScope(actor, conversation),
          select: rideSelect,
          orderBy: { createdAt: "desc" },
          take: 20,
        });
        break;
      case "read_ride": {
        target = String(params.rideId);
        result = await db.courseDrive.findFirst({
          where: {
            AND: [{ id: target }, await rideScope(actor, conversation)],
          },
          select: rideSelect,
        });
        if (!result) throw new ApiError(404, "Course introuvable", "NOT_FOUND");
        break;
      }
      case "prepare_availability": {
        target = String(params.productId);
        const product = await db.product.findUnique({
          where: { id: target },
          select: {
            id: true,
            storeId: true,
            name: true,
            deletedAt: true,
            updatedAt: true,
            store: { select: { name: true } },
          },
        });
        if (!product || product.deletedAt)
          throw new ApiError(404, "Produit introuvable", "NOT_FOUND");
        if (conversation.storeId !== product.storeId)
          throw new ApiError(
            403,
            "Établissement hors du contexte sélectionné",
            "ASSISTANT_STORE_CONTEXT_REQUIRED",
          );
        await manageable(actor, product.storeId);
        result = await prepare(
          actor,
          conversation,
          tool,
          {
            ...params,
            storeId: product.storeId,
            version: product.updatedAt.toISOString(),
          } as Prisma.InputJsonValue,
          target,
          `ZupEat — ${product.store.name} : rendre « ${product.name} » ${params.available ? "disponible" : "indisponible"}. La disponibilité sera visible par les clients. Aucun prix ne change.`,
        );
        break;
      }
      case "prepare_hours": {
        target = String(params.storeId);
        if (conversation.storeId !== target)
          throw new ApiError(
            403,
            "Établissement hors du contexte sélectionné",
            "ASSISTANT_STORE_CONTEXT_REQUIRED",
          );
        await manageable(actor, target);
        const day = preparerJour({
          closed: Boolean(params.closed),
          plages: params.plages as { open: string; close: string }[],
        });
        const store = await db.store.findUniqueOrThrow({
          where: { id: target },
          select: { name: true, updatedAt: true },
        });
        result = await prepare(
          actor,
          conversation,
          tool,
          {
            ...params,
            version: store.updatedAt.toISOString(),
          } as Prisma.InputJsonValue,
          target,
          `ZupEat — ${store.name} : ${NOM_DU_JOUR[String(params.day)]} ${day.closed ? "fermé" : day.plages.map((p) => `${p.open}–${p.close}`).join(", ")}. Ces horaires modifient l’ouverture et les créneaux de retrait.`,
        );
        break;
      }
      case "prepare_ride_cancellation": {
        target = String(params.rideId);
        const ride = await db.courseDrive.findFirst({
          where: { id: target, passagerId: userId },
          select: { statut: true, prixCentimes: true, devise: true },
        });
        if (!ride) throw new ApiError(404, "Course introuvable", "NOT_FOUND");
        if (!["RECHERCHE", "ACCEPTEE", "ARRIVEE"].includes(ride.statut))
          throw new ApiError(
            409,
            "Cette course ne peut plus être annulée",
            "INVALID_RIDE_STATUS",
          );
        result = await prepare(
          actor,
          conversation,
          tool,
          params as Prisma.InputJsonValue,
          target,
          `ZupDrive — annuler la course ${target}, prix annoncé ${(ride.prixCentimes / 100).toFixed(2)} ${ride.devise}. La prise en charge s’arrêtera. Aucun paiement en ligne ni remboursement n’est exécuté en V1.`,
        );
        break;
      }
    }
    // Sortie bornée, sérialisée : aucun objet Prisma complet ni secret.
    const serialized = JSON.stringify(result);
    if (!serialized || serialized.length > 32_000)
      throw new ApiError(
        503,
        "Résultat trop volumineux",
        "ASSISTANT_TOOL_UNAVAILABLE",
      );
    const parsed = toolOutputs[tool].safeParse(
      JSON.parse(redactSecrets(serialized)),
    );
    if (!parsed.success)
      throw new ApiError(
        503,
        "Résultat métier non validé",
        "ASSISTANT_TOOL_INVALID_OUTPUT",
      );
    const safe = parsed.data;
    await db.assistantToolExecution.create({
      data: {
        conversationId: conversation.id,
        actorId: userId,
        tool,
        target,
        status: "SUCCESS",
        startedAt,
        completedAt: new Date(),
      },
    });
    return safe as ToolOutput<T>;
  } catch (error) {
    await db.assistantToolExecution.create({
      data: {
        conversationId: conversation.id,
        actorId: userId,
        tool,
        target,
        status: "FAILED",
        code: error instanceof ApiError ? error.code : "TOOL_UNAVAILABLE",
        startedAt,
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function confirmAction(
  actor: Acteur,
  conversation: AssistantConversation,
  actionId: string,
) {
  const userId = authenticated(actor);
  const action = await db.assistantAction.findFirst({
    where: { id: actionId, conversationId: conversation.id, actorId: userId },
  });
  if (!action) throw new ApiError(404, "Action introuvable", "NOT_FOUND");
  if (action.state === "EXECUTED")
    return { state: action.state, result: action.result };
  if (
    action.segment !== conversation.segment ||
    !definitionsFor(conversation).some((t) => t.name === action.tool) ||
    action.expiresAt <= new Date()
  )
    throw new ApiError(
      409,
      "Confirmation expirée ou contexte modifié",
      "ASSISTANT_CONFIRMATION_EXPIRED",
    );
  if (action.state === "EXECUTING") {
    await reconcilePendingActions(actor, conversation);
    const current = await db.assistantAction.findUniqueOrThrow({
      where: { id: action.id },
    });
    return {
      state: current.state,
      result: current.result,
      message:
        "Consultez l’état avant toute nouvelle tentative ; aucune action n’a été rejouée.",
    };
  }
  if (action.state !== "PENDING")
    throw new ApiError(
      409,
      "Action non confirmable",
      "ASSISTANT_ACTION_CONFLICT",
    );

  // Une annulation ZupDrive réutilise le service métier idempotent existant.
  // Après un timeout, une confirmation consulte son état sans rejouer l'action.
  if (action.tool === "prepare_ride_cancellation") {
    const claimed = await db.assistantAction.updateMany({
      where: { id: action.id, state: "PENDING", expiresAt: { gt: new Date() } },
      data: { state: "EXECUTING", confirmedAt: new Date() },
    });
    if (!claimed.count) return { state: "EXECUTING" };
    try {
      await CourseDriveService.annulerParPassager(userId, action.target);
      await db.$transaction(async (tx) => {
        await tx.assistantAction.update({
          where: { id: action.id },
          data: { state: "EXECUTED", result: { status: "ANNULEE" } },
        });
        await tx.assistantToolExecution.create({
          data: {
            conversationId: conversation.id,
            actorId: userId,
            tool: action.tool,
            target: action.target,
            status: "EXECUTED",
          },
        });
        await tx.systemAuditLog.create({
          data: {
            adminId: userId,
            action: "ASSISTANT_ACTION_EXECUTED",
            target: action.target,
            changes: {
              actionId: action.id,
              service: conversation.service,
              tool: action.tool,
            },
          },
        });
      });
      return { state: "EXECUTED", result: { status: "ANNULEE" } };
    } catch {
      const actual = await db.courseDrive.findFirst({
        where: { id: action.target, passagerId: userId },
        select: { statut: true, annuleePar: true },
      });
      if (actual?.statut === "ANNULEE" && actual.annuleePar === "PASSAGER") {
        await reconcilePendingActions(actor, conversation);
        return { state: "EXECUTED", result: { status: "ANNULEE" } };
      }
      // On n'invente pas un échec définitif et ne relance pas une opération incertaine.
      return {
        state: "EXECUTING",
        message:
          "Résultat non confirmé. Demandez un conseiller avant de réessayer.",
      };
    }
  }

  const params = action.params as Record<string, unknown>;
  const storeId = String(params.storeId);
  await manageable(actor, storeId);
  return db.$transaction(
    async (tx) => {
      const current = await tx.assistantConversation.findFirst({
        where: { id: conversation.id, segment: action.segment },
      });
      if (!current)
        throw new ApiError(
          409,
          "Le contexte a changé",
          "ASSISTANT_ACTION_CONFLICT",
        );
      // Relecture dans la transaction des rôles et du statut ; même règle partagée.
      const store = await tx.store.findUniqueOrThrow({
        where: { id: storeId },
        select: { operatingHours: true, updatedAt: true, orgId: true },
      });
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: store.orgId },
        select: { status: true, isDemo: true },
      });
      if (org.status !== "ACTIVE" || org.isDemo)
        throw new ApiError(403, "Compte restreint", "ACCOUNT_RESTRICTED");
      await exigerBoutique(actor, storeId, "manage", tx);
      const claimed = await tx.assistantAction.updateMany({
        where: {
          id: action.id,
          state: "PENDING",
          expiresAt: { gt: new Date() },
        },
        data: {
          state: "EXECUTED",
          confirmedAt: new Date(),
          result: { status: "updated" },
        },
      });
      if (!claimed.count)
        throw new ApiError(
          409,
          "Action déjà confirmée",
          "ASSISTANT_ACTION_CONFLICT",
        );
      if (action.tool === "prepare_availability") {
        const validated = toolInputs.prepare_availability.parse({
          productId: action.target,
          available: params.available,
        });
        const changed = await tx.product.updateMany({
          where: {
            id: action.target,
            storeId,
            deletedAt: null,
            updatedAt: new Date(String(params.version)),
          },
          data: { isAvailable: validated.available },
        });
        if (!changed.count)
          throw new ApiError(
            409,
            "Produit modifié depuis la proposition : préparez une nouvelle confirmation",
            "ASSISTANT_TARGET_CHANGED",
          );
      } else if (action.tool === "prepare_hours") {
        const validated = toolInputs.prepare_hours.parse({
          storeId,
          day: params.day,
          closed: params.closed,
          plages: params.plages,
        });
        const dayHours = preparerJour({
          closed: validated.closed,
          plages: validated.plages,
        });
        const changed = await tx.store.updateMany({
          where: {
            id: storeId,
            deletedAt: null,
            updatedAt: new Date(String(params.version)),
          },
          data: {
            operatingHours: {
              ...(store.operatingHours as Prisma.JsonObject),
              [validated.day]: dayHours,
            } as Prisma.InputJsonValue,
          },
        });
        if (!changed.count)
          throw new ApiError(
            409,
            "Établissement modifié depuis la proposition : préparez une nouvelle confirmation",
            "ASSISTANT_TARGET_CHANGED",
          );
      } else
        throw new ApiError(403, "Action désactivée", "ASSISTANT_TOOL_DENIED");
      await tx.assistantToolExecution.create({
        data: {
          conversationId: conversation.id,
          actorId: userId,
          tool: action.tool,
          target: action.target,
          status: "EXECUTED",
        },
      });
      await tx.systemAuditLog.create({
        data: {
          adminId: userId,
          action: "ASSISTANT_ACTION_EXECUTED",
          target: action.target,
          changes: {
            actionId: action.id,
            service: conversation.service,
            tool: action.tool,
          },
        },
      });
      return { state: "EXECUTED", result: { status: "updated" } };
    },
    { isolationLevel: "Serializable" },
  );
}

/** Résout un timeout depuis l'état métier, sans répéter une opération. */
export async function reconcilePendingActions(
  actor: Acteur,
  conversation: AssistantConversation,
) {
  if (!actor.userId) return;
  const executing = await db.assistantAction.findMany({
    where: {
      conversationId: conversation.id,
      actorId: actor.userId,
      tool: "prepare_ride_cancellation",
      state: "EXECUTING",
    },
    take: 20,
  });
  for (const action of executing) {
    const actual = await db.courseDrive.findFirst({
      where: { id: action.target, passagerId: actor.userId },
      select: { statut: true, annuleePar: true },
    });
    if (actual?.statut !== "ANNULEE" || actual.annuleePar !== "PASSAGER")
      continue;
    await db.$transaction(async (tx) => {
      const changed = await tx.assistantAction.updateMany({
        where: { id: action.id, state: "EXECUTING" },
        data: { state: "EXECUTED", result: { status: "ANNULEE" } },
      });
      if (changed.count) {
        await tx.assistantToolExecution.create({
          data: {
            conversationId: conversation.id,
            actorId: actor.userId,
            tool: action.tool,
            target: action.target,
            status: "RECONCILED",
          },
        });
        await tx.systemAuditLog.create({
          data: {
            adminId: actor.userId!,
            action: "ASSISTANT_ACTION_RECONCILED",
            target: action.target,
            changes: { actionId: action.id, status: "ANNULEE" },
          },
        });
      }
    });
  }
}
