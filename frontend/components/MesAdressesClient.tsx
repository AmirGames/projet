"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { IconeAdresse } from "./IconeAdresse";
import { useEffectChargement } from "@/lib/use-effect-chargement";
import {
  enregistrerAdresseLivraison,
  lireAdresseLivraison,
  type AdresseLivraison,
} from "@/lib/adresseLivraison";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
export type AdresseFavorite = AdresseLivraison & {
  id: string;
  kind: "HOME" | "WORK" | "OTHER";
  name: string;
};

export function MesAdressesClient() {
  const t = useTranslations("savedAddresses");
  const [adresses, setAdresses] = useState<AdresseFavorite[]>([]);
  const [brouillon, setBrouillon] = useState<AdresseFavorite | null>(null);
  const [chargement, setChargement] = useState(true);
  const [chargees, setChargees] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const titre = (adresse: Pick<AdresseFavorite, "kind" | "name">) =>
    adresse.kind === "HOME"
      ? t("home")
      : adresse.kind === "WORK"
        ? t("work")
        : adresse.name;

  const charger = useCallback(async () => {
    setErreur("");
    try {
      const reponse = await fetch(`${API_URL}/api/client/me/addresses`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });
      if (!reponse.ok) throw new Error(t("loadError"));
      const corps = await reponse.json();
      setAdresses((corps.data || []).filter((a: AdresseLivraison) => a.kind));
      setChargees(true);
    } catch {
      setErreur(t("loadError"));
    } finally {
      setChargement(false);
    }
  }, [t]);
  useEffectChargement(() => {
    void charger();
  }, [charger]);

  const editer = (kind: AdresseFavorite["kind"], adresse?: AdresseFavorite) => {
    setMessage("");
    setBrouillon(
      adresse || {
        id:
          crypto.randomUUID?.() ||
          Array.from(crypto.getRandomValues(new Uint32Array(4)))
            .map((n) => n.toString(16).padStart(8, "0"))
            .join(""),
        kind,
        name: "",
        label: "",
        street: "",
        city: "",
        postalCode: "",
        latitude: null,
        longitude: null,
      },
    );
  };
  const enregistrer = async (suivantes: AdresseFavorite[]) => {
    setEnvoi(true);
    setErreur("");
    setMessage("");
    try {
      const reponse = await fetch(`${API_URL}/api/client/me/addresses`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify({ addresses: suivantes }),
      });
      const corps = await reponse.json();
      if (!reponse.ok) throw new Error(corps.error || t("saveError"));
      setAdresses(corps.data);
      const courante = lireAdresseLivraison();
      const choisie = corps.data.find(
        (a: AdresseFavorite) => a.id === courante?.id,
      );
      if (choisie) enregistrerAdresseLivraison(choisie);
      else if (courante?.id) {
        const { id, kind, name, ...lieu } = courante;
        void id;
        void kind;
        void name;
        enregistrerAdresseLivraison(lieu);
      }
      setBrouillon(null);
      setMessage(t("saved"));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t("saveError"));
    } finally {
      setEnvoi(false);
    }
  };
  const ligne = (kind: AdresseFavorite["kind"], adresse?: AdresseFavorite) => (
    <div
      key={adresse?.id || kind}
      className="flex items-center gap-3 border-b border-gray-100 py-4 last:border-0"
    >
      <IconeAdresse kind={kind} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-900">
          {titre({ kind, name: adresse?.name || "" })}
        </p>
        <p className="wrap-break-word text-sm text-gray-500">
          {adresse
            ? `${adresse.street}, ${adresse.postalCode} ${adresse.city}`
            : t("notAdded")}
        </p>
      </div>
      <button
        type="button"
        disabled={envoi || !chargees}
        onClick={() => editer(kind, adresse)}
        aria-label={`${adresse ? t("edit") : t("add")} ${titre({ kind, name: adresse?.name || "" })}`}
        className="rounded-lg p-2 text-orange-700 hover:bg-orange-50"
      >
        {adresse ? <Pencil size={18} /> : <Plus size={18} />}
      </button>
      {adresse && (
        <button
          type="button"
          disabled={envoi}
          onClick={() =>
            void enregistrer(adresses.filter((a) => a.id !== adresse.id))
          }
          aria-label={`${t("remove")} ${titre(adresse)}`}
          className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-bold text-gray-900">{t("title")}</h2>
      <p className="mt-1 text-sm text-gray-500">{t("description")}</p>
      {erreur && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {erreur}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-green-700">
          {message}
        </p>
      )}
      {chargement ? (
        <p className="mt-4 text-sm text-gray-500">{t("loading")}</p>
      ) : (
        <>
          {ligne(
            "HOME",
            adresses.find((a) => a.kind === "HOME"),
          )}
          {ligne(
            "WORK",
            adresses.find((a) => a.kind === "WORK"),
          )}
          {adresses
            .filter((a) => a.kind === "OTHER")
            .map((a) => ligne("OTHER", a))}
          <button
            type="button"
            disabled={envoi || !chargees || adresses.length >= 20}
            onClick={() => editer("OTHER")}
            className="mt-3 flex items-center gap-2 text-sm font-semibold text-orange-700"
          >
            <Plus size={18} />
            {t("addFavorite")}
          </button>
          {erreur && !brouillon && (
            <button
              type="button"
              onClick={() => void charger()}
              className="mt-3 text-sm underline"
            >
              {t("retry")}
            </button>
          )}
        </>
      )}
      {brouillon && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enregistrer([
              ...adresses.filter((a) => a.id !== brouillon.id),
              brouillon,
            ]);
          }}
          className="mt-5 space-y-3 rounded-xl bg-gray-50 p-4"
        >
          <h3 className="flex items-center gap-2 font-semibold text-gray-900">
            <IconeAdresse kind={brouillon.kind} />
            {brouillon.kind === "OTHER" ? t("favorite") : titre(brouillon)}
          </h3>
          {brouillon.kind === "OTHER" && (
            <label className="block text-sm text-gray-700">
              {t("name")}
              <input
                required
                maxLength={50}
                value={brouillon.name}
                onChange={(e) =>
                  setBrouillon({ ...brouillon, name: e.target.value })
                }
                placeholder={t("namePlaceholder")}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>
          )}
          <label className="block text-sm text-gray-700">
            {t("street")}
            <AddressAutocomplete
              clair
              value={brouillon.street}
              onChange={(street) =>
                setBrouillon({
                  ...brouillon,
                  street,
                  latitude: null,
                  longitude: null,
                })
              }
              onSelect={(a) => setBrouillon({ ...brouillon, ...a })}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-sm text-gray-700">
              {t("postalCode")}
              <input
                required
                maxLength={20}
                value={brouillon.postalCode}
                onChange={(e) =>
                  setBrouillon({
                    ...brouillon,
                    postalCode: e.target.value,
                    latitude: null,
                    longitude: null,
                  })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="text-sm text-gray-700 sm:col-span-2">
              {t("city")}
              <input
                required
                maxLength={100}
                value={brouillon.city}
                onChange={(e) =>
                  setBrouillon({
                    ...brouillon,
                    city: e.target.value,
                    latitude: null,
                    longitude: null,
                  })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
          </div>
          <div className="flex gap-3">
            <button
              disabled={envoi || brouillon.street.trim().length < 3}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {envoi ? t("saving") : t("save")}
            </button>
            <button
              type="button"
              disabled={envoi}
              onClick={() => setBrouillon(null)}
              className="rounded-lg px-4 py-2 text-sm text-gray-700"
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
