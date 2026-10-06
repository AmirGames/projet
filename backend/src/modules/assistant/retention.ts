import { db } from "../../services/db";

/** Appelé par la tâche de maintenance ; aucun contenu n'est journalisé. */
export async function purgeAssistantConversations(now = new Date()) {
  // Une opération incertaine exige la réconciliation humaine, pas l'effacement.
  return db.assistantConversation.deleteMany({
    where: {
      expiresAt: { lte: now },
      actions: { none: { state: "EXECUTING" } },
      OR: [{ busyUntil: null }, { busyUntil: { lt: now } }],
    },
  });
}
