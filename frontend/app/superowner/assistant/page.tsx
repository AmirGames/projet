"use client";

import { useState } from "react";
import { useEffectChargement } from "@/lib/use-effect-chargement";
import {
  assistantRequest,
  serviceLabels,
  type Service,
} from "@/lib/assistant-api";
import { SafeAssistantContent } from "@/components/assistant/AssistantWidget";
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('assistantSupport');
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
      setError(e instanceof Error ? e.message : t('indisponible'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="p-4 sm:p-8 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">{t('titre')}</h1>
      <p className="text-sm text-gray-500">
        {t('intro')}
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
        {t('actualiser')}
      </button>
      {!handoffs.length && !error && <p>{t('aucune')}</p>}
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
  const t = useTranslations('assistantSupport');
  const [reply, setReply] = useState("");
  return (
    <article className="border rounded-xl p-4 space-y-3 bg-white text-gray-900">
      <h2 className="font-semibold">
        {serviceLabels[h.service]} · {h.specialty} · {h.state} · {h.priority}
      </h2>
      <p className="text-xs break-all">
        {t("reference", { id: h.id })}
        {h.ticketId ? t("ticketMarchand", { id: h.ticketId }) : ""}
      </p>
      <SafeAssistantContent content={h.summary} />
      {h.reply && (
        <div className="p-3 bg-gray-50 rounded-sm">
          <p className="font-medium">{t('reponseTransmise')}</p>
          <SafeAssistantContent content={h.reply} />
        </div>
      )}
      <button
        className="underline"
        disabled={busy}
        onClick={() => void update(h.id, "IN_PROGRESS")}
      >
        {t('prendre')}
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void update(h.id, "RESOLVED", reply).then(() => setReply(""));
        }}
        className="space-y-2"
      >
        <label className="block">
          {t('reponseATransmettre')}
          <textarea
            required
            maxLength={4000}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="block border rounded-sm p-2 w-full text-gray-900"
          />
        </label>
        <button disabled={busy} className="rounded-sm border px-3 py-2">
          {t('envoyer')}
        </button>
      </form>
    </article>
  );
}
