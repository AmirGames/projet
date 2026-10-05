"use client";

import { useState } from "react";
import { useEffectChargement } from "@/lib/use-effect-chargement";
import {
  assistantRequest,
  serviceLabels,
  type Service,
} from "@/lib/assistant-api";
import { SafeAssistantContent } from "@/components/assistant/AssistantWidget";

interface Handoff {
  id: string;
  service: Service;
  specialty: string;
  summary: string;
  priority: string;
  state: string;
  reply: string | null;
  ticketId: string | null;
}
export default function AssistantSupportPage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setHandoffs(
      (await assistantRequest<{ handoffs: Handoff[] }>("admin/handoffs"))
        .handoffs,
    );
  };
  useEffectChargement(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  const update = async (id: string, state: string, reply?: string) => {
    setBusy(true);
    setError("");
    try {
      await assistantRequest(`admin/handoffs/${id}`, "PATCH", {
        state,
        ...(reply ? { reply } : {}),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Support indisponible");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="p-4 sm:p-8 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Relais humains — Assistant ZupOne</h1>
      <p className="text-sm text-gray-500">
        Demandes des plateformes autorisées par vos permissions de support. Le
        résumé minimal est transmis ; l’historique privé ne l’est pas.
      </p>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <button
        onClick={() => void load().catch((e) => setError(e.message))}
        className="underline"
      >
        Actualiser
      </button>
      {!handoffs.length && !error && <p>Aucune demande accessible.</p>}
      {handoffs.map((h) => (
        <HandoffCard key={h.id} handoff={h} busy={busy} update={update} />
      ))}
    </main>
  );
}
function HandoffCard({
  handoff: h,
  busy,
  update,
}: {
  handoff: Handoff;
  busy: boolean;
  update: (id: string, state: string, reply?: string) => Promise<void>;
}) {
  const [reply, setReply] = useState("");
  return (
    <article className="border rounded-xl p-4 space-y-3 bg-white text-gray-900">
      <h2 className="font-semibold">
        {serviceLabels[h.service]} · {h.specialty} · {h.state} · {h.priority}
      </h2>
      <p className="text-xs break-all">
        Référence : {h.id}
        {h.ticketId ? ` · Ticket marchand : ${h.ticketId}` : ""}
      </p>
      <SafeAssistantContent content={h.summary} />
      {h.reply && (
        <div className="p-3 bg-gray-50 rounded">
          <p className="font-medium">Réponse transmise</p>
          <SafeAssistantContent content={h.reply} />
        </div>
      )}
      <button
        className="underline"
        disabled={busy}
        onClick={() => void update(h.id, "IN_PROGRESS")}
      >
        Prendre en charge
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void update(h.id, "RESOLVED", reply).then(() => setReply(""));
        }}
        className="space-y-2"
      >
        <label className="block">
          Réponse à transmettre
          <textarea
            required
            maxLength={4000}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="block border rounded p-2 w-full text-gray-900"
          />
        </label>
        <button disabled={busy} className="rounded border px-3 py-2">
          Envoyer la réponse et résoudre
        </button>
      </form>
    </article>
  );
}
