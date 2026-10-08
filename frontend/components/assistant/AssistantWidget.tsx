"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import { MessageCircle, Send, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  assistantRequest,
  serviceLabels,
  type AssistantConfig,
  type Category,
  type Conversation,
  type Service,
} from "@/lib/assistant-api";
import { BusinessPanel } from "./BusinessPanel";
import { useEffectChargement } from "@/lib/use-effect-chargement";

const buttonClass =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50";
export function safeAssistantLink(value: string) {
  // Liens locaux seulement, sans protocole, contrôle ni échappement de domaine.
  return /^\/(?!\/)[a-zA-Z0-9/_-]*(?:#[a-zA-Z0-9_-]+)?$/.test(value)
    ? value
    : undefined;
}
export function SafeAssistantContent({ content }: { content: string }) {
  const t = useTranslations("assistant");
  return (
    <ReactMarkdown
      skipHtml
      urlTransform={(value) => safeAssistantLink(value) || ""}
      components={{
        a: ({ href, children }) =>
          safeAssistantLink(href || "") ? (
            <a href={href} className="underline">
              {children}
            </a>
          ) : (
            <span>{children}</span>
          ),
        img: () => <span>{t('imageNonPriseEnCharge')}</span>,
        p: ({ children }) => (
          <p className="mb-2 last:mb-0 whitespace-pre-wrap wrap-break-word">
            {children}
          </p>
        ),
        code: ({ children }) => (
          <code className="whitespace-pre-wrap break-all">{children}</code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default function AssistantWidget() {
  const { user, isLoading } = useAuth();
  // Le changement de compte détruit immédiatement tout l'état privé du widget.
  return (
    <AssistantSessionWidget key={user?.id || "visitor"} isLoading={isLoading} />
  );
}
function AssistantSessionWidget({ isLoading }: { isLoading: boolean }) {
  const t = useTranslations("assistant");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [history, setHistory] = useState<
    { id: string; service: Service; category: Category | null }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [picker, setPicker] = useState<"service" | "category" | null>(null);
  const [handoff, setHandoff] = useState(false);
  const [reason, setReason] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [partnerChoice, setPartnerChoice] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | undefined>();
  const launcher = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const epoch = useRef(0);
  const alive = useRef(true);
  const retryMessage = useRef<{ content: string; clientKey: string } | null>(
    null,
  );

  useEffect(() => {
    const lifetime = epoch;
    alive.current = true;
    return () => {
      alive.current = false;
      lifetime.current++;
    };
  }, []);
  const run = (work: () => Promise<void>) => {
    const current = epoch.current;
    setBusy(true);
    setError("");
    void work()
      .catch((e) => {
        if (epoch.current === current)
          setError(e instanceof Error ? e.message : t('indisponible'));
      })
      .finally(() => {
        if (epoch.current === current) setBusy(false);
      });
  };
  // Ignore une réponse arrivée après un changement de compte.
  const setCurrent = useCallback((c: Conversation, expected?: number) => {
    if (alive.current && (expected === undefined || epoch.current === expected))
      setConversation(c);
  }, []);
  const load = async () => {
    const current = epoch.current;
    const c = await assistantRequest<AssistantConfig>("config");
    const prior = await assistantRequest<{ conversations: typeof history }>(
      "conversations",
    );
    if (epoch.current !== current) return;
    setConfig(c);
    setHistory(prior.conversations);
    if (prior.conversations.length) {
      try {
        setCurrent(
          await assistantRequest<Conversation>(
            `conversations/${prior.conversations[0].id}`,
          ),
          current,
        );
      } catch {
        setCurrent(
          await assistantRequest<Conversation>("conversations", "POST", {}),
          current,
        );
      }
    } else
      setCurrent(
        await assistantRequest<Conversation>("conversations", "POST", {}),
        current,
      );
  };
  useEffectChargement(() => {
    if (open && !config && !isLoading) run(load);
    // Une ouverture ou un changement de compte recharge son propre contexte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const launchButton = launcher.current;
    const first = dialog.current?.querySelector<HTMLElement>("button");
    first?.focus();
    const viewport = window.visualViewport;
    const resize = () => setViewportHeight(viewport?.height);
    resize();
    viewport?.addEventListener("resize", resize);
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary",
        ) || [],
      ).filter((el) => el.getClientRects().length > 0);
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          !dialog.current?.contains(document.activeElement))
      ) {
        e.preventDefault();
        last?.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          !dialog.current?.contains(document.activeElement))
      ) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      viewport?.removeEventListener("resize", resize);
      (previous || launchButton)?.focus();
    };
  }, [open]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [conversation?.messages.length]);
  // Les réponses humaines sont réellement persistées ; pas de faux état « en ligne ».
  useEffect(() => {
    if (
      !open ||
      !conversation?.handoffs.some((h) =>
        ["OPEN", "IN_PROGRESS"].includes(h.state),
      )
    )
      return;
    const id = conversation.id,
      current = epoch.current;
    const timer = setInterval(() => {
      if (!busy)
        void assistantRequest<Conversation>(`conversations/${id}`)
          .then((c) => setCurrent(c, current))
          .catch(() => undefined);
    }, 15000);
    return () => clearInterval(timer);
  }, [open, conversation?.id, conversation?.handoffs, busy, setCurrent]);
  const choose = (service: Service, category: Category | null) => {
    if (!conversation) return;
    const current = epoch.current;
    run(async () => {
      const next = await assistantRequest<Conversation>(
        `conversations/${conversation.id}/context`,
        "PATCH",
        { service, category },
      );
      setCurrent(next, current);
      setPicker(null);
      setHandoff(false);
      setPartnerChoice(false);
      retryMessage.current = null;
    });
  };
  const send = (content = text) => {
    if (!conversation || busy || !content.trim()) return;
    const message =
      retryMessage.current?.content === content.trim()
        ? retryMessage.current
        : { content: content.trim(), clientKey: crypto.randomUUID() };
    retryMessage.current = message;
    const current = epoch.current;
    run(async () => {
      const next = await assistantRequest<Conversation>(
        `conversations/${conversation.id}/messages`,
        "POST",
        message,
      );
      setCurrent(next, current);
      if (current === epoch.current) {
        setText("");
        retryMessage.current = null;
        input.current?.focus();
      }
    });
  };
  const refresh = () =>
    run(async () => {
      if (!conversation || !config) await load();
      else
        setCurrent(
          await assistantRequest<Conversation>(
            `conversations/${conversation.id}`,
          ),
        );
    });
  const activeService = conversation?.service || config?.service || "ONE";
  const showServices = picker === "service" || activeService === "ONE";
  const showCategories = picker === "category" || !conversation?.category;
  const lastReply = conversation?.messages
    .slice()
    .reverse()
    .find(
      (m) => m.author === "ASSISTANT" && m.segment === conversation.segment,
    );
  const showGuides = config?.mode !== "real" || lastReply?.mode === "degraded";
  return (
    <>
      <button
        ref={launcher}
        type="button"
        aria-label={t('ouvrir')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-gray-950 text-white px-4 py-3 shadow-xl focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-blue-600 print:hidden"
      >
        <MessageCircle size={22} aria-hidden="true" />
        <span className="hidden sm:inline">{t('titre')}</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-60 print:hidden"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="zupone-assistant-title"
            style={
              viewportHeight
                ? { maxHeight: `calc(${viewportHeight}px - 16px)` }
                : undefined
            }
            className="fixed z-61 bottom-2 right-2 left-2 sm:left-auto sm:right-5 sm:bottom-5 sm:w-[440px] h-[min(680px,calc(100dvh-16px))] flex flex-col rounded-2xl shadow-2xl border border-gray-200 bg-white text-gray-900 overflow-hidden print:hidden"
          >
            <header
              className={`p-4 flex gap-3 items-start text-white ${activeService === "EAT" ? "bg-orange-600" : activeService === "DRIVE" ? "bg-blue-700" : "bg-gray-950"}`}
            >
              <div className="flex-1">
                <h2 id="zupone-assistant-title" className="font-bold">
                  {t('titre')}
                </h2>
                <p className="text-sm">
                  {serviceLabels[activeService]} ·{" "}
                  {conversation?.specialty || t("orientation")}
                </p>
                <p className="text-xs mt-1">
                  {t('assistantIa')}{" "}
                  {config?.mode === "simulation"
                    ? t("mode.simulation")
                    : config?.mode === "degraded"
                      ? t("mode.degrade")
                      : config?.provider === "ollama"
                        ? t("mode.locale")
                        : t("mode.reel")}
                </p>
              </div>
              <button
                aria-label={t('fermer')}
                onClick={() => setOpen(false)}
                className="p-1 rounded-sm focus-visible:outline-solid"
              >
                <X size={22} />
              </button>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {config && <p className="p-4 text-sm">{config.welcome}</p>}
              {error && (
                <div
                  role="alert"
                  className="mx-3 my-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm"
                >
                  <p>{error}</p>
                  <button
                    className="underline mt-1"
                    onClick={refresh}
                    disabled={busy}
                  >
                    {t('reconnecter')}
                  </button>
                </div>
              )}
              {!config && !error && (
                <p role="status" className="p-4">
                  {t('connexion')}
                </p>
              )}
              {conversation && (
                <>
                  <div
                    role="log"
                    aria-label={t('historique')}
                    aria-live="polite"
                    aria-relevant="additions"
                    className="p-3 space-y-3"
                  >
                    {conversation.messages.map((m) => (
                      <article
                        key={m.id}
                        className={`p-3 rounded-xl text-sm ${m.author === "USER" ? "bg-blue-50 ml-8" : m.author === "SYSTEM" ? "bg-gray-100 text-gray-600" : "bg-gray-50 mr-3"}`}
                      >
                        <p className="text-xs font-medium mb-1">
                          {m.author === "USER"
                            ? t("auteur.vous")
                            : m.author === "SYSTEM"
                              ? t("auteur.systeme")
                              : t("auteur.assistant", { service: serviceLabels[m.service] })}
                        </p>
                        {m.mode === "degraded" && m.author === "ASSISTANT" && (
                          <p className="text-xs text-amber-800 mb-1">
                            {t('degradee')}
                          </p>
                        )}
                        <SafeAssistantContent content={m.content} />
                      </article>
                    ))}
                    <div ref={end} />
                  </div>
                  <div
                    className="p-3 flex flex-wrap gap-2"
                    aria-label={t('servicesCategories')}
                  >
                    {showServices ? (
                      <>
                        {partnerChoice && (
                          <p className="w-full text-sm">
                            {t('partenariatService')}
                          </p>
                        )}
                        <button
                          className={buttonClass}
                          disabled={busy}
                          onClick={() =>
                            choose("EAT", partnerChoice ? "commercial" : null)
                          }
                        >
                          ZupEat
                        </button>
                        <button
                          className={buttonClass}
                          disabled={busy}
                          onClick={() =>
                            choose("DRIVE", partnerChoice ? "commercial" : null)
                          }
                        >
                          ZupDrive
                        </button>
                        <button
                          className={buttonClass}
                          disabled={
                            busy ||
                            !config?.categories.some(
                              (c) =>
                                c.service === "ONE" && c.id === "orientation",
                            )
                          }
                          onClick={() => choose("ONE", "orientation")}
                        >
                          {t('infosZupone')}
                        </button>
                        <button
                          className={buttonClass}
                          disabled={busy}
                          onClick={() => {
                            setPicker("service");
                            setPartnerChoice(true);
                          }}
                        >
                          {t('devenirPartenaire')}
                        </button>
                      </>
                    ) : (
                      showCategories &&
                      config?.categories
                        .filter((c) => c.service === activeService)
                        .map((c) => (
                          <button
                            className={buttonClass}
                            disabled={busy}
                            key={c.agentId}
                            onClick={() => choose(activeService, c.id)}
                          >
                            {t(`categories.${c.id}`)}
                          </button>
                        ))
                    )}
                  </div>
                  {showGuides && conversation.category && (
                    <section aria-label={t('aideGuidee')} className="px-3 pb-3">
                      <p className="text-sm font-medium mb-2">
                        {t('questionsFrequentes')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {config?.guideQuestions
                          .filter(
                            (g) =>
                              g.service === conversation.service &&
                              g.category === conversation.category,
                          )
                          .map((g) => (
                            <button
                              key={g.id}
                              className={buttonClass}
                              disabled={busy}
                              onClick={() => send(g.question)}
                            >
                              {g.title}
                            </button>
                          ))}
                      </div>
                    </section>
                  )}
                  {config?.authenticated ? (
                    <BusinessPanel
                      key={`${conversation.id}-${conversation.segment}-${conversation.actions
                        .filter((a) => a.state === "EXECUTED")
                        .map((a) => a.id)
                        .join(",")}`}
                      conversation={conversation}
                      busy={busy}
                      run={run}
                      onConversation={setCurrent}
                    />
                  ) : (
                    conversation.category &&
                    !["orientation", "commercial"].includes(
                      conversation.category,
                    ) && (
                      <p className="px-4 py-2 text-sm">
                        {t.rich("connectezVous", {
                          lien: (morceau) => (
                            <a className="underline" href="/login">
                              {morceau}
                            </a>
                          ),
                        })}
                      </p>
                    )
                  )}
                  {conversation.actions.map((action) => (
                    <div
                      key={action.id}
                      className="m-3 p-3 border rounded-xl border-amber-300 bg-amber-50 text-sm"
                    >
                      <p className="font-semibold">
                        {action.state === "PENDING"
                          ? t("action.attendue")
                          : action.state === "EXECUTING"
                            ? t("action.enCours")
                            : action.state === "EXECUTED"
                              ? t("action.executee")
                              : t("action.annulee")}
                      </p>
                      <p className="my-2">{action.summary}</p>
                      {action.state === "PENDING" && (
                        <>
                          <p className="text-xs mb-2">
                            {t("action.valable", {
                              heure: new Date(action.expiresAt).toLocaleTimeString(locale),
                            })}
                          </p>
                          <button
                            className={buttonClass}
                            disabled={
                              busy || new Date(action.expiresAt) <= new Date()
                            }
                            onClick={() =>
                              run(async () => {
                                const result = await assistantRequest<{
                                  conversation: Conversation;
                                }>(
                                  `conversations/${conversation.id}/actions/${action.id}/confirm`,
                                  "POST",
                                  {},
                                );
                                setCurrent(result.conversation);
                              })
                            }
                          >
                            {t('confirmerAction')}
                          </button>
                        </>
                      )}
                      {action.state === "EXECUTING" && (
                        <button
                          className="underline"
                          onClick={refresh}
                          disabled={busy}
                        >
                          {t('consulterEtat')}
                        </button>
                      )}
                    </div>
                  ))}
                  {conversation.handoffs.map((h) => (
                    <div
                      key={h.id}
                      className="m-3 p-3 border border-blue-200 rounded-xl bg-blue-50 text-sm"
                    >
                      <p className="font-semibold">
                        {h.state === "RESOLVED" || h.state === "CLOSED"
                          ? t("conseiller.traitee")
                          : h.state === "IN_PROGRESS"
                            ? t("conseiller.priseEnCharge")
                            : t("conseiller.enregistree")}
                      </p>
                      <p className="text-xs break-all">
                        {t("conseiller.reference", { ref: h.ticketId || h.id })} ·{" "}
                        {serviceLabels[h.service]} · {h.specialty}
                      </p>
                      {h.reply ? (
                        <SafeAssistantContent content={h.reply} />
                      ) : (
                        <p>
                          {t('aucunDelai')}
                        </p>
                      )}
                    </div>
                  ))}
                  {handoff && (
                    <form
                      className="m-3 p-3 rounded-xl border space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(async () => {
                          setCurrent(
                            await assistantRequest<Conversation>(
                              `conversations/${conversation.id}/handoff`,
                              "POST",
                              { reason, consent: true },
                            ),
                          );
                          setHandoff(false);
                          setReason("");
                        });
                      }}
                    >
                      <label className="block text-sm">
                        {t('motif')}
                        <textarea
                          required
                          minLength={2}
                          maxLength={500}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className="block w-full border rounded-sm p-2 mt-1 text-gray-900"
                        />
                      </label>
                      <p className="text-xs">
                        {t('motifAide')}
                      </p>
                      <button disabled={busy} className={buttonClass}>
                        {t('transmettre')}
                      </button>
                      <button
                        type="button"
                        className="ml-3 underline text-sm"
                        onClick={() => setHandoff(false)}
                      >
                        {t('annuler')}
                      </button>
                    </form>
                  )}
                  <nav
                    aria-label={t('actionsConversation')}
                    className="p-3 flex flex-wrap gap-x-3 gap-y-2 text-xs border-t"
                  >
                    <button
                      disabled={busy}
                      className="underline"
                      onClick={() => setPicker("category")}
                    >
                      {t('changerCategorie')}
                    </button>
                    <button
                      disabled={busy}
                      className="underline"
                      onClick={() => setPicker("service")}
                    >
                      {t('changerService')}
                    </button>
                    <button
                      disabled={busy}
                      className="underline"
                      onClick={() => setHandoff(true)}
                    >
                      {t('conseiller.parler')}
                    </button>
                    <button
                      disabled={busy}
                      className="underline"
                      onClick={() =>
                        run(async () => {
                          setCurrent(
                            await assistantRequest<Conversation>(
                              "conversations",
                              "POST",
                              {},
                            ),
                          );
                          setPicker(null);
                          setHistory(
                            (
                              await assistantRequest<{
                                conversations: typeof history;
                              }>("conversations")
                            ).conversations,
                          );
                        })
                      }
                    >
                      {t('nouvelle')}
                    </button>
                    <button
                      disabled={busy}
                      className="underline"
                      onClick={() => setDeleteConfirm(true)}
                    >
                      {t('supprimer')}
                    </button>
                  </nav>
                  {deleteConfirm && (
                    <div className="m-3 p-3 border border-red-200 rounded-lg text-sm">
                      <p>
                        {t('supprimerConfirm')}
                      </p>
                      <button
                        disabled={busy}
                        className="underline mr-3 mt-2"
                        onClick={() =>
                          run(async () => {
                            await assistantRequest(
                              `conversations/${conversation.id}`,
                              "DELETE",
                              { confirmDeletion: true },
                            );
                            setDeleteConfirm(false);
                            setConversation(null);
                            await load();
                          })
                        }
                      >
                        {t('confirmerSuppression')}
                      </button>
                      <button
                        className="underline"
                        onClick={() => setDeleteConfirm(false)}
                      >
                        {t('annuler')}
                      </button>
                    </div>
                  )}
                  <p className="px-3 text-xs text-gray-500">
                    {t("conservation", { jours: config?.retentionDays ?? 0 })}
                  </p>
                  {history.length > 0 && (
                    <label className="block p-3 text-xs">
                      {t('reprendre')}
                      <select
                        aria-label={t('reprendre')}
                        value={conversation.id}
                        disabled={busy}
                        onChange={(e) =>
                          run(async () => {
                            setCurrent(
                              await assistantRequest<Conversation>(
                                `conversations/${e.target.value}`,
                              ),
                            );
                          })
                        }
                        className="block border p-2 mt-1 w-full rounded-sm text-gray-900"
                      >
                        <option value={conversation.id}>
                          {t('actuelle')}
                        </option>
                        {history
                          .filter((c) => c.id !== conversation.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {serviceLabels[c.service]} ·{" "}
                              {c.category
                                ? t(`categories.${c.category}`)
                                : t("orientation")}{" "}
                              · {c.id.slice(-6)}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </>
              )}
            </div>
            <footer className="border-t p-3 bg-white shrink-0">
              {busy && (
                <p role="status" className="text-xs mb-2">
                  {t('traitement')}
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  ref={input}
                  aria-label={t('votreMessageA')}
                  placeholder={t('votreMessage')}
                  rows={2}
                  maxLength={4000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  disabled={busy || !conversation}
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 p-2 text-base text-gray-900 resize-none focus:outline-blue-600"
                />
                <button
                  type="submit"
                  aria-label={t('envoyer')}
                  disabled={busy || !conversation || !text.trim()}
                  className="rounded-xl bg-gray-950 text-white p-3 disabled:opacity-40 focus-visible:outline-solid focus-visible:outline-blue-600"
                >
                  <Send size={20} />
                </button>
              </form>
              {config && (
                <a
                  href={config.privacyUrl}
                  className="text-xs underline text-gray-500 mt-2 inline-block"
                >
                  {t('confidentialite')}
                </a>
              )}
              <span className="text-xs text-gray-400 block">
                {t('piecesJointes')}
              </span>
            </footer>
          </div>
        </>
      )}
    </>
  );
}
