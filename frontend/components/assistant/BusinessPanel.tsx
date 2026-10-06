"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { assistantRequest, type Conversation } from "@/lib/assistant-api";

interface Resource {
  id: string;
  name?: string;
  status?: string;
  statut?: string;
  paymentStatus?: string;
  isAvailable?: boolean;
  orderId?: string;
  driverPayout?: string;
  store?: { name: string };
  totalAmount?: string;
  prixCentimes?: number;
  devise?: string;
}
export function BusinessPanel({
  conversation,
  busy,
  run,
  onConversation,
}: {
  conversation: Conversation;
  busy: boolean;
  run: (work: () => Promise<void>) => void;
  onConversation: (c: Conversation) => void;
}) {
  const t = useTranslations("assistant.panneau");
  const [resources, setResources] = useState<Resource[]>([]);
  const [products, setProducts] = useState<Resource[]>([]);
  const [storeId, setStoreId] = useState(conversation.storeId || "");
  const [productId, setProductId] = useState("");
  const [day, setDay] = useState("MON");
  const [opening, setOpening] = useState("09:00");
  const [closing, setClosing] = useState("22:00");
  const [closed, setClosed] = useState(false);
  const [details, setDetails] = useState<Resource | null>(null);
  const [hours, setHours] = useState("");
  const [orders, setOrders] = useState<Resource[]>([]);
  const tool = async (name: string, params: unknown = {}) => {
    const data = await assistantRequest<{
      result: unknown;
      conversation: Conversation;
    }>(`conversations/${conversation.id}/tools`, "POST", { name, params });
    onConversation(data.conversation);
    return data.result;
  };
  const load = () =>
    run(async () => {
      const name =
        conversation.category === "customer"
          ? "my_orders"
          : conversation.category === "restaurant"
            ? "my_stores"
            : conversation.category === "courier"
              ? "my_deliveries"
              : "my_rides";
      setResources((await tool(name)) as Resource[]);
    });
  const chooseStore = (id: string) =>
    run(async () => {
      const next = await assistantRequest<Conversation>(
        `conversations/${conversation.id}/context`,
        "PATCH",
        { service: "EAT", category: "restaurant", storeId: id },
      );
      onConversation(next);
      setStoreId(id);
    });
  const category = conversation.category;
  if (!category || ["orientation", "commercial"].includes(category))
    return null;
  return (
    <section
      aria-label={t('contexte')}
      className="border-t border-gray-200 p-3 space-y-2 bg-gray-50 text-sm"
    >
      <button
        disabled={busy}
        onClick={load}
        className="underline font-medium disabled:opacity-50"
      >
        {category === "restaurant"
          ? t("choisirEtablissement")
          : category === "customer"
            ? t("mesCommandes")
            : t("mesCourses")}
      </button>
      {category === "restaurant" && resources.length > 0 && (
        <label className="block">
          {t('etablissement')}
          <select
            aria-label={t('etablissementAutorise')}
            value={storeId}
            disabled={busy}
            onChange={(e) => chooseStore(e.target.value)}
            className="block w-full rounded border p-2 text-gray-900"
          >
            <option value="">{t('choisir')}</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {category !== "restaurant" &&
        resources.map((r) => (
          <article key={r.id} className="rounded bg-white border p-2">
            <p>
              {r.store?.name || t("course")} — {r.status || r.statut}
            </p>
            <p className="text-xs break-all">{t("reference", { ref: r.orderId || r.id })}</p>
            {r.paymentStatus && (
              <p>
                {t("paiement", { statut: r.paymentStatus, montant: r.totalAmount ?? "" })}
              </p>
            )}
            {r.prixCentimes !== undefined && (
              <p>
                {t("prixAnnonce", { prix: (r.prixCentimes / 100).toFixed(2), devise: r.devise ?? "" })}
              </p>
            )}
            {r.driverPayout && (
              <p>{t("gain", { montant: r.driverPayout })}</p>
            )}
            {category === "customer" && (
              <button
                disabled={busy}
                className="underline mr-3"
                onClick={() =>
                  run(async () => {
                    setDetails(
                      (await tool("read_order", { orderId: r.id })) as Resource,
                    );
                  })
                }
              >
                {t('actualiser')}
              </button>
            )}
            {category === "passenger" &&
              ["RECHERCHE", "ACCEPTEE", "ARRIVEE"].includes(r.statut || "") && (
                <button
                  disabled={busy}
                  className="underline"
                  onClick={() =>
                    run(async () => {
                      await tool("prepare_ride_cancellation", { rideId: r.id });
                    })
                  }
                >
                  {t('demanderAnnulation')}
                </button>
              )}
          </article>
        ))}
      {details && (
        <p role="status">
          {t("statutActuel", { statut: details.status ?? "", paiement: details.paymentStatus ?? "" })}
        </p>
      )}
      {category === "restaurant" && storeId && (
        <>
          <p className="font-medium">
            {t("etablissementSelectionne")}{" "}
            {conversation.storeName ||
              resources.find((r) => r.id === storeId)?.name ||
              storeId}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={busy}
              className="underline"
              onClick={() =>
                run(async () => {
                  setProducts(
                    (await tool("store_products", { storeId })) as Resource[],
                  );
                })
              }
            >
              {t('voirProduits')}
            </button>
            <button
              disabled={busy}
              className="underline"
              onClick={() =>
                run(async () => {
                  setOrders(
                    (await tool("store_orders", { storeId })) as Resource[],
                  );
                })
              }
            >
              {t('voirCommandes')}
            </button>
            <button
              disabled={busy}
              className="underline"
              onClick={() =>
                run(async () => {
                  const result = (await tool("store_hours", { storeId })) as {
                    operatingHours: Record<
                      string,
                      {
                        closed: boolean;
                        plages?: { open: string; close: string }[];
                        open?: string;
                        close?: string;
                      }
                    >;
                  };
                  setHours(
                    Object.entries(result.operatingHours || {})
                      .map(
                        ([day, h]) =>
                          `${t(`jours.${day}`)} : ${h.closed ? t("ferme") : (h.plages || [{ open: h.open, close: h.close }]).map((p) => `${p.open}–${p.close}`).join(", ")}`,
                      )
                      .join("\n"),
                  );
                })
              }
            >
              {t('voirHoraires')}
            </button>
          </div>
          {hours && <p className="whitespace-pre-wrap">{hours}</p>}
          {orders.map((order) => (
            <p key={order.id} className="rounded border p-2 bg-white">
              {t("commande", { id: order.id, statut: order.status ?? "" })}
            </p>
          ))}
          {products.length > 0 && (
            <>
              <select
                aria-label={t('produitAModifier')}
                value={productId}
                disabled={busy}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full border rounded p-2 text-gray-900"
              >
                <option value="">{t('choisirProduit')}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.isAvailable ? t("disponible") : t("indisponible")}
                  </option>
                ))}
              </select>
              <div className="flex gap-3">
                {[true, false].map((available) => (
                  <button
                    key={String(available)}
                    disabled={busy || !productId}
                    className="underline disabled:opacity-50"
                    onClick={() =>
                      run(async () => {
                        await tool("prepare_availability", {
                          productId,
                          available,
                        });
                      })
                    }
                  >
                    {available ? t("rendreDisponible") : t("rendreIndisponible")}
                  </button>
                ))}
              </div>
            </>
          )}
          <details>
            <summary className="cursor-pointer font-medium">
              {t('proposerHoraires')}
            </summary>
            <p className="text-xs my-2">
              {t('unePlage')}
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label={t('jourAModifier')}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="border rounded p-1 text-gray-900"
              >
                {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(
                  (d) => (
                    <option key={d} value={d}>
                      {t(`jours.${d}`)}
                    </option>
                  ),
                )}
              </select>
              <label>
                {t('ouverture')}
                <input
                  aria-label={t('heureOuverture')}
                  type="time"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  className="block border rounded p-1 text-gray-900"
                />
              </label>
              <label>
                {t('fermeture')}
                <input
                  aria-label={t('heureFermeture')}
                  type="time"
                  value={closing}
                  onChange={(e) => setClosing(e.target.value)}
                  className="block border rounded p-1 text-gray-900"
                />
              </label>
              <label className="self-center">
                <input
                  type="checkbox"
                  checked={closed}
                  onChange={(e) => setClosed(e.target.checked)}
                />{" "}
                {t('fermeCase')}
              </label>
            </div>
            <button
              disabled={busy}
              className="underline mt-2"
              onClick={() =>
                run(async () => {
                  await tool("prepare_hours", {
                    storeId,
                    day,
                    closed,
                    plages: [{ open: opening, close: closing }],
                  });
                })
              }
            >
              {t('preparer')}
            </button>
          </details>
        </>
      )}
    </section>
  );
}
