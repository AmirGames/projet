import express from "express";
import request from "supertest";
import { db } from "../../../services/db";
import { AuthService } from "../../auth/auth.service";
import router from "../routes";
import { signGateway } from "../context";
import { setupErrorHandling } from "../../../middleware/errorHandler";
import { agentFor } from "../registry";
import {
  changeSelection,
  createConversation,
  ownedConversation,
  publicConversation,
  requestHandoff,
  sendMessage,
  withConversationOperation,
  type AssistantActor,
} from "../service";
import { confirmAction, executeTool, toolOutputs } from "../tools";
import { purgeAssistantConversations } from "../retention";

jest.mock("../../../config/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("../../../config/env", () => ({
  getEnv: () => ({
    NODE_ENV: "test",
    API_URL: "http://localhost:3001",
    FRONTEND_URL: "http://localhost:3000",
    JWT_SECRET: "assistant-test-access-secret-at-least-32-characters",
    JWT_REFRESH_SECRET: "assistant-test-refresh-secret-different-32-characters",
    JWT_EXPIRES_IN: "15m",
    JWT_REFRESH_EXPIRES_IN: "7d",
    ENABLE_STRIPE: false,
  }),
}));
jest.mock("../../support/ticket-message.service", () => ({
  TicketMessageService: {
    notifierOuvertureDeTicket: jest.fn(async () => undefined),
  },
}));
jest.mock("../../notifications/email.service", () => ({
  EmailService: { send: jest.fn(async () => undefined) },
}));

const enabled = !!process.env.ASSISTANT_TEST_DATABASE_URL;
const suite = enabled ? describe : describe.skip;
suite(
  "Assistant : base PostgreSQL de test isolée, REST et règles métier",
  () => {
    const prefix = "assistant-test-";
    const uid = prefix + "alice",
      bob = prefix + "bob",
      employee = prefix + "employee",
      manager = prefix + "manager";
    const orgA = prefix + "org-a",
      orgB = prefix + "org-b",
      storeA = prefix + "store-a",
      storeB = prefix + "store-b";
    const productA = prefix + "product-a",
      productB = prefix + "product-b";
    const actor = (userId: string): AssistantActor => ({
      userId,
      host: "localhost:3000",
      compte: {
        id: userId,
        isSystemAdmin: false,
        isSuperOwner: false,
        acces: {},
      },
    });
    const app = express();
    app.use(express.json());
    app.use("/api/assistant", router);
    setupErrorHandling(app);
    beforeAll(async () => {
      const testUrl = process.env.ASSISTANT_TEST_DATABASE_URL!;
      if (
        process.env.DATABASE_URL !== testUrl ||
        !new URL(testUrl).pathname.endsWith("_test") ||
        !["127.0.0.1", "localhost"].includes(new URL(testUrl).hostname)
      )
        throw new Error(
          "Seule une base locale explicitement nommée *_test est autorisée",
        );
      process.env.NODE_ENV = "test";
      process.env.ASSISTANT_PROVIDER = "openai";
      process.env.ASSISTANT_MODE = "degraded";
      process.env.JWT_SECRET =
        "assistant-test-access-secret-at-least-32-characters";
      process.env.JWT_REFRESH_SECRET =
        "assistant-test-refresh-secret-different-32-characters";
      process.env.API_URL = "http://localhost:3001";
      process.env.FRONTEND_URL = "http://localhost:3000";
      delete process.env.ASSISTANT_HOSTS;
      for (const userId of [uid, bob, employee, manager])
        await db.user.create({
          data: {
            id: userId,
            email: `${userId}@example.invalid`,
            passwordHash: "dummy-test-hash",
            name: userId,
          },
        });
      for (const org of [orgA, orgB])
        await db.organization.create({
          data: { id: org, slug: org, name: org },
        });
      for (const [id, orgId] of [
        [storeA, orgA],
        [storeB, orgB],
      ])
        await db.store.create({ data: { id, orgId, slug: id, name: id } });
      await db.membership.createMany({
        data: [
          {
            userId: manager,
            orgId: orgA,
            role: "STORE_MANAGER",
            storeIds: [storeA],
          },
          {
            userId: employee,
            orgId: orgA,
            role: "STORE_STAFF",
            storeIds: [storeA],
          },
        ],
      });
      for (const [id, storeId] of [
        [productA, storeA],
        [productB, storeB],
      ])
        await db.product.create({
          data: {
            id,
            storeId,
            sku: id,
            name: "Produit test",
            price: 10,
            isAvailable: true,
          },
        });
      for (const userId of [uid, bob]) {
        const customer = await db.customer.create({
          data: { userId, email: `${userId}@example.invalid`, name: userId },
        });
        await db.order.create({
          data: {
            id: prefix + "order-" + (userId === uid ? "a" : "b"),
            customerId: customer.id,
            storeId: storeA,
            customerName: "Privé",
            customerEmail: "private@example.invalid",
            customerPhone: "000000000",
            deliveryType: "PICKUP",
            totalAmount: 10,
            taxAmount: 0,
            feesAmount: 0,
          },
        });
        await db.chauffeurDrive.create({
          data: { userId, nomComplet: "Chauffeur privé" },
        });
        await db.courier.create({
          data: {
            userId,
            name: userId,
            email: `courier-${userId}@example.invalid`,
            phone: "000000000",
            vehicleType: "bike",
          },
        });
        await db.courseDrive.create({
          data: {
            id: prefix + "ride-" + (userId === uid ? "a" : "b"),
            passagerId: userId,
            cleIdempotence: "test",
            statut: "RECHERCHE",
            region: "BRUXELLES",
            departAdresse: "Adresse privée",
            departLatitude: 50,
            departLongitude: 4,
            arriveeAdresse: "Adresse privée",
            arriveeLatitude: 50,
            arriveeLongitude: 4,
            distanceMetres: 1,
            dureeSecondes: 1,
            prixCentimes: 1000,
            tarifApplique: {},
          },
        });
      }
    });
    afterAll(async () => {
      await db.assistantConversation.deleteMany({
        where: {
          OR: [
            { ownerId: { in: [uid, bob, employee, manager] } },
            { guestHash: { in: ["guest-a", "guest-b"] } },
          ],
        },
      });
      await db.courseDrive.deleteMany({
        where: { id: { startsWith: prefix } },
      });
      await db.order.deleteMany({ where: { id: { startsWith: prefix } } });
      await db.customer.deleteMany({
        where: {
          email: { endsWith: "@example.invalid" },
          userId: { in: [uid, bob] },
        },
      });
      await db.courier.deleteMany({ where: { userId: { in: [uid, bob] } } });
      await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
      await db.user.deleteMany({
        where: { id: { in: [uid, bob, employee, manager] } },
      });
      await db.$disconnect();
    });
    async function conversation(
      userId = uid,
      category:
        | "customer"
        | "restaurant"
        | "courier"
        | "passenger"
        | "driver" = "customer",
    ) {
      let c = await createConversation(
        actor(userId),
        category === "passenger" || category === "driver" ? "DRIVE" : "EAT",
        null,
      );
      c = await changeSelection(actor(userId), c, {
        service: c.service as "EAT",
        category,
        ...(category === "restaurant" ? { storeId: storeA } : {}),
      });
      return c;
    }
    it("bloque les commandes d’un autre compte et minimise les champs retournés", async () => {
      const c = await conversation();
      await expect(
        executeTool(actor(uid), c, "read_order", {
          orderId: prefix + "order-b",
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
      const own = await executeTool(actor(uid), c, "read_order", {
        orderId: prefix + "order-a",
      });
      expect(own.id).toBe(prefix + "order-a");
      expect(own).not.toHaveProperty("customerPhone");
      expect(own).not.toHaveProperty("customerEmail");
      expect(
        toolOutputs.read_order.safeParse({ ...own, customerPhone: "private" })
          .success,
      ).toBe(false);
      expect(
        toolOutputs.read_order.safeParse({ ...own, status: "INVENTED" })
          .success,
      ).toBe(false);
    });
    it("bloque un établissement étranger, un changement de contexte interdit et les modifications employé", async () => {
      const c = await conversation(manager, "restaurant");
      await expect(
        executeTool(actor(manager), c, "store_products", { storeId: storeB }),
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        changeSelection(actor(manager), c, {
          service: "EAT",
          category: "restaurant",
          storeId: storeB,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
      const staff = await conversation(employee, "restaurant");
      await expect(
        executeTool(actor(employee), staff, "prepare_availability", {
          productId: productA,
          available: false,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
    it("ne donne aucun outil métier à l’orientation et refuse les paramètres de droits", async () => {
      const c = await createConversation(actor(uid), "ONE", "orientation");
      await expect(
        executeTool(actor(uid), c, "read_order", {
          orderId: prefix + "order-a",
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
      const client = await conversation();
      await expect(
        executeTool(actor(uid), client, "refund", {
          orderId: prefix + "order-a",
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        executeTool(actor(uid), client, "read_order", {
          orderId: prefix + "order-a",
          userId: bob,
          role: "ADMIN",
        }),
      ).rejects.toThrow();
    });
    it("isole les courses passager et chauffeur, sans adresse privée", async () => {
      const c = await conversation(uid, "passenger");
      await expect(
        executeTool(actor(uid), c, "read_ride", { rideId: prefix + "ride-b" }),
      ).rejects.toMatchObject({ statusCode: 404 });
      const own = await executeTool(actor(uid), c, "read_ride", {
        rideId: prefix + "ride-a",
      });
      expect(own).not.toHaveProperty("departAdresse");
      const driver = await conversation(uid, "driver");
      await expect(
        executeTool(actor(uid), driver, "read_ride", {
          rideId: prefix + "ride-a",
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
    it("une proposition ne modifie rien ; confirmation unique et idempotente", async () => {
      const c = await conversation(manager, "restaurant");
      const action = await executeTool(
        actor(manager),
        c,
        "prepare_availability",
        { productId: productA, available: false },
      );
      expect(
        (await db.product.findUniqueOrThrow({ where: { id: productA } }))
          .isAvailable,
      ).toBe(true);
      await expect(
        confirmAction(actor(bob), c, action.id),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect((await confirmAction(actor(manager), c, action.id)).state).toBe(
        "EXECUTED",
      );
      expect((await confirmAction(actor(manager), c, action.id)).state).toBe(
        "EXECUTED",
      );
      expect(
        (await db.product.findUniqueOrThrow({ where: { id: productA } }))
          .isAvailable,
      ).toBe(false);
      expect(
        await db.assistantToolExecution.count({
          where: { conversationId: c.id, status: "EXECUTED" },
        }),
      ).toBe(1);
    });
    it("refuse confirmation expirée, cible modifiée et permission révoquée", async () => {
      const c = await conversation(manager, "restaurant");
      const expired = await executeTool(
        actor(manager),
        c,
        "prepare_availability",
        { productId: productA, available: true },
      );
      await db.assistantAction.update({
        where: { id: expired.id },
        data: { expiresAt: new Date(0) },
      });
      await expect(
        confirmAction(actor(manager), c, expired.id),
      ).rejects.toMatchObject({ statusCode: 409 });
      const changed = await executeTool(
        actor(manager),
        c,
        "prepare_availability",
        { productId: productA, available: true },
      );
      await db.product.update({
        where: { id: productA },
        data: { name: "Modifié" },
      });
      await expect(
        confirmAction(actor(manager), c, changed.id),
      ).rejects.toMatchObject({ statusCode: 409 });
      const revoked = await executeTool(
        actor(manager),
        c,
        "prepare_availability",
        { productId: productA, available: true },
      );
      await db.membership.update({
        where: { userId_orgId: { userId: manager, orgId: orgA } },
        data: { storeIds: [] },
      });
      await expect(
        confirmAction(actor(manager), c, revoked.id),
      ).rejects.toMatchObject({ statusCode: 403 });
      await db.membership.update({
        where: { userId_orgId: { userId: manager, orgId: orgA } },
        data: { storeIds: [storeA] },
      });
    });
    it("modifie les horaires avec confirmation et validation métier partagée", async () => {
      const c = await conversation(manager, "restaurant");
      const action = await executeTool(actor(manager), c, "prepare_hours", {
        storeId: storeA,
        day: "MON",
        closed: false,
        plages: [{ open: "17:30", close: "01:00" }],
      });
      expect(
        (await db.store.findUniqueOrThrow({ where: { id: storeA } }))
          .operatingHours,
      ).toEqual({});
      await confirmAction(actor(manager), c, action.id);
      expect(
        (await db.store.findUniqueOrThrow({ where: { id: storeA } }))
          .operatingHours,
      ).toMatchObject({ MON: { plages: [{ open: "17:30", close: "01:00" }] } });
      await expect(
        executeTool(actor(manager), c, "prepare_hours", {
          storeId: storeA,
          day: "MON",
          closed: false,
          plages: [
            { open: "09:00", close: "13:00" },
            { open: "12:00", close: "14:00" },
          ],
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
    it("réconcilie un timeout d’annulation sans rejouer l’opération et désactive les actions financières", async () => {
      const c = await conversation(uid, "passenger");
      const action = await executeTool(
        actor(uid),
        c,
        "prepare_ride_cancellation",
        { rideId: prefix + "ride-a" },
      );
      expect(
        (
          await db.courseDrive.findUniqueOrThrow({
            where: { id: prefix + "ride-a" },
          })
        ).statut,
      ).toBe("RECHERCHE");
      await db.assistantAction.update({
        where: { id: action.id },
        data: { state: "EXECUTING", confirmedAt: new Date() },
      });
      // Le service a réussi, mais sa réponse au demandeur a été perdue.
      await db.courseDrive.update({
        where: { id: prefix + "ride-a" },
        data: { statut: "ANNULEE", annuleePar: "PASSAGER" },
      });
      expect(
        (await publicConversation(actor(uid), c.id)).actions[0].state,
      ).toBe("EXECUTED");
      expect((await confirmAction(actor(uid), c, action.id)).state).toBe(
        "EXECUTED",
      );
      expect(
        await db.assistantToolExecution.count({
          where: { conversationId: c.id, status: "RECONCILED" },
        }),
      ).toBe(1);
      await expect(
        executeTool(actor(uid), c, "refund", { rideId: prefix + "ride-a" }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
    it("change de service en conservant l’historique sans le transmettre au nouvel agent", async () => {
      let c = await conversation();
      await sendMessage(actor(uid), c, {
        content: "ma commande",
        clientKey: crypto.randomUUID(),
      });
      c = await ownedConversation(actor(uid), c.id);
      c = await changeSelection(actor(uid), c, {
        service: "DRIVE",
        category: "passenger",
      });
      process.env.ASSISTANT_MODE = "real";
      process.env.ASSISTANT_OPENAI_KEY = "test-key";
      process.env.ASSISTANT_OPENAI_MODEL = "configured-test-model";
      const respond = jest.fn(async (_agent, history) => {
        expect(
          history.every(
            (m: { content: string }) => !m.content.includes("ma commande"),
          ),
        ).toBe(true);
        return "Réponse contrôlée";
      });
      await sendMessage(
        actor(uid),
        c,
        { content: "mon trajet", clientKey: crypto.randomUUID() },
        { respond, classify: jest.fn() },
      );
      expect(respond).toHaveBeenCalledTimes(1);
      expect(
        (await publicConversation(actor(uid), c.id)).messages.some(
          (m) => m.service === "EAT",
        ),
      ).toBe(true);
      process.env.ASSISTANT_MODE = "degraded";
      delete process.env.ASSISTANT_OPENAI_KEY;
    });
    it("aide sans fournisseur, reprend une relance et isole le contexte après changement de service", async () => {
      let c = await conversation();
      const provider = { respond: jest.fn(), classify: jest.fn() };
      const ask = async (content: string) => {
        const reply = await sendMessage(
          actor(uid),
          c,
          { content, clientKey: crypto.randomUUID() },
          provider,
        );
        c = await ownedConversation(actor(uid), c.id);
        return reply;
      };
      expect((await ask("ma commande est en retard")).content).toContain(
        "Actualiser le suivi",
      );
      expect((await ask("et ensuite ?")).content).toContain(
        "Actualiser le suivi",
      );
      c = await changeSelection(actor(uid), c, {
        service: "DRIVE",
        category: "passenger",
      });
      const reply = await ask("et ensuite ?");
      expect(reply.content).toContain(
        "Votre question porte sur le suivi d’une course",
      );
      expect(reply.content).not.toContain("Actualiser le suivi");
      expect(provider.respond).not.toHaveBeenCalled();
      expect(provider.classify).not.toHaveBeenCalled();
    });
    it("masque un secret et n’appelle pas le fournisseur ; reprend sans doubler le message", async () => {
      const c = await conversation();
      const key = crypto.randomUUID();
      const provider = { respond: jest.fn(), classify: jest.fn() };
      await sendMessage(
        actor(uid),
        c,
        { content: "password=MonSecret123!", clientKey: key },
        provider,
      );
      await sendMessage(
        actor(uid),
        c,
        { content: "password=MonSecret123!", clientKey: key },
        provider,
      );
      const saved = await publicConversation(actor(uid), c.id);
      expect(JSON.stringify(saved)).not.toContain("MonSecret123");
      expect(provider.respond).not.toHaveBeenCalled();
      expect(saved.messages.filter((m) => m.author === "USER")).toHaveLength(1);
    });
    it("le fournisseur en panne produit un mode dégradé explicite", async () => {
      const c = await conversation();
      process.env.ASSISTANT_MODE = "real";
      process.env.ASSISTANT_OPENAI_KEY = "test";
      process.env.ASSISTANT_OPENAI_MODEL = "test";
      const answer = await sendMessage(
        actor(uid),
        c,
        { content: "ma commande", clientKey: crypto.randomUUID() },
        {
          respond: jest.fn(async () => {
            throw new Error("provider timeout");
          }),
          classify: jest.fn(),
        },
      );
      expect(answer.mode).toBe("degraded");
      expect(answer.content).toContain("IA indisponible");
      process.env.ASSISTANT_MODE = "degraded";
    });
    it("reprend seulement ses conversations, session invitée et domaine inclus", async () => {
      const c = await conversation();
      await expect(ownedConversation(actor(bob), c.id)).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(
        ownedConversation({ ...actor(uid), host: "zupeat.com" }, c.id),
      ).rejects.toMatchObject({ statusCode: 404 });
      const guest = { host: "localhost:3000", guestHash: "guest-a" };
      const anonymous = await createConversation(guest, "ONE", "orientation");
      await expect(
        ownedConversation(
          { host: guest.host, guestHash: "guest-b" },
          anonymous.id,
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        ownedConversation(guest, anonymous.id),
      ).resolves.toHaveProperty("id", anonymous.id);
    });
    it("crée un relais minimal idempotent et réutilise un ticket marchand", async () => {
      const c = await conversation(manager, "restaurant");
      await sendMessage(actor(manager), c, {
        content: "information privée hors résumé",
        clientKey: crypto.randomUUID(),
      });
      const handoff = await requestHandoff(
        actor(manager),
        c,
        "Incident d’impression",
      );
      expect(handoff.ticketId).toBeTruthy();
      expect(handoff.summary).not.toContain("information privée hors résumé");
      expect((await requestHandoff(actor(manager), c, "rejeu")).id).toBe(
        handoff.id,
      );
      expect(
        await db.merchantTicket.count({ where: { id: handoff.ticketId! } }),
      ).toBe(1);
    });
    function apiCall(
      method: "get" | "post" | "patch" | "delete",
      path: string,
      userId?: string,
      body?: unknown,
      signed = true,
    ) {
      const timestamp = String(Date.now());
      const authorization = userId
        ? `Bearer ${AuthService.generateAccessToken(userId)}`
        : "";
      let call = request(app)
        [method]("/api/assistant/" + path)
        .set("Origin", "http://localhost:3000")
        .set("Content-Type", "application/json");
      if (authorization) call = call.set("Authorization", authorization);
      if (signed)
        call = call
          .set("x-assistant-host", "localhost:3000")
          .set("x-assistant-surface", "one")
          .set("x-assistant-time", timestamp)
          .set(
            "x-assistant-signature",
            signGateway(
              timestamp,
              "localhost:3000",
              "one",
              method.toUpperCase(),
              "/api/assistant/" + path,
              body,
              authorization,
              "",
            ),
          );
      return body === undefined ? call : call.send(body as object);
    }
    it("REST : hôte non signé, CSRF, identité forgée, conversation étrangère et payload abusif sont bloqués", async () => {
      await apiCall("get", "config", undefined, undefined, false).expect(403);
      const c = await conversation();
      await apiCall("get", `conversations/${c.id}`, bob).expect(404);
      await apiCall("post", `conversations/${c.id}/messages`, uid, {
        content: "x".repeat(4001),
        clientKey: crypto.randomUUID(),
      }).expect(400);
      await apiCall("post", "conversations", uid, { role: "ADMIN" }).expect(
        400,
      );
      await apiCall("post", "conversations", uid, {})
        .set("Origin", "https://evil.example")
        .expect(403);
      await apiCall("get", "config", uid)
        .set("Authorization", "Bearer forged")
        .expect(401);
      await apiCall("get", "admin/handoffs", uid).expect(403);
    });
    it("le relais humain utilise les permissions de support par plateforme et transmet la réponse", async () => {
      await db.user.update({
        where: { id: manager },
        data: { isSystemAdmin: true },
      });
      await db.accesEquipe.create({
        data: { userId: manager, plateforme: "EAT", role: "SUPPORT" },
      });
      try {
        const eat = await conversation(manager, "restaurant");
        const eatHandoff = await requestHandoff(
          actor(manager),
          eat,
          "Question support",
        );
        const drive = await conversation(bob, "passenger");
        const driveHandoff = await requestHandoff(
          actor(bob),
          drive,
          "Question trajet",
        );
        const inbox = await apiCall("get", "admin/handoffs", manager).expect(
          200,
        );
        expect(
          inbox.body.handoffs.some(
            (h: { id: string }) => h.id === eatHandoff.id,
          ),
        ).toBe(true);
        expect(
          inbox.body.handoffs.some(
            (h: { id: string }) => h.id === driveHandoff.id,
          ),
        ).toBe(false);
        await apiCall("patch", `admin/handoffs/${driveHandoff.id}`, manager, {
          state: "RESOLVED",
          reply: "Interdit",
        }).expect(404);
        await apiCall("patch", `admin/handoffs/${eatHandoff.id}`, manager, {
          state: "RESOLVED",
          reply: "Réponse confirmée du conseiller",
        }).expect(200);
        expect(
          (await publicConversation(actor(manager), eat.id)).handoffs[0].reply,
        ).toBe("Réponse confirmée du conseiller");
      } finally {
        await db.accesEquipe.deleteMany({ where: { userId: manager } });
        await db.user.update({
          where: { id: manager },
          data: { isSystemAdmin: false },
        });
      }
    });
    it("supprime un historique autorisé et purge les conversations expirées", async () => {
      const c = await conversation();
      await apiCall("delete", `conversations/${c.id}`, bob, {
        confirmDeletion: true,
      }).expect(404);
      await apiCall("delete", `conversations/${c.id}`, uid, {
        confirmDeletion: true,
      }).expect(204);
      const expired = await conversation();
      await db.assistantConversation.update({
        where: { id: expired.id },
        data: { expiresAt: new Date(0) },
      });
      await purgeAssistantConversations();
      expect(
        await db.assistantConversation.findUnique({
          where: { id: expired.id },
        }),
      ).toBeNull();
    });
    it("verrouille les opérations contre les changements de contexte et les requêtes concurrentes", async () => {
      const a = actor(uid);
      const c = await createConversation(a, "EAT", "customer");
      await withConversationOperation(c, async () => {
        await expect(
          withConversationOperation(c, async () => undefined),
        ).rejects.toMatchObject({ code: "ASSISTANT_BUSY" });
        await expect(
          changeSelection(a, c, { service: "DRIVE", category: "passenger" }),
        ).rejects.toMatchObject({ code: "ASSISTANT_BUSY" });
        const deletion = await apiCall("delete", `conversations/${c.id}`, uid, {
          confirmDeletion: true,
        });
        expect(deletion.status).toBe(409);
      });
      const current = await ownedConversation(a, c.id);
      expect(current.busyUntil).toBeNull();
      await withConversationOperation(current, async () => undefined);
    });

    it("désactiver l’orientation ne bloque pas la création d’une conversation", async () => {
      const orientation = agentFor("ONE", "orientation");
      orientation.enabled = false;
      try {
        const c = await createConversation(actor(uid), "ONE", "orientation");
        expect(c.agentId).toBeNull();
        expect(c.category).toBeNull();
      } finally {
        orientation.enabled = true;
      }
    });

    it("chaque spécialité reçoit seulement ses outils métier", () =>
      expect(agentFor("DRIVE", "driver").tools).not.toContain("read_order"));
  },
);
