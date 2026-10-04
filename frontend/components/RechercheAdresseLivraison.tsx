"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  ChevronDown,
  Clock,
  MapPin,
  Navigation,
  Search,
  X,
} from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { ConfirmationAdresseLocalisee } from "@/components/ConfirmationAdresseLocalisee";
import {
  localiserAdresse,
  type AdresseLocalisee,
} from "@/lib/localisation-adresse";
import {
  enregistrerAdresseLivraison,
  lireAdressesRecentes,
  cleAdresse,
  type AdresseLivraison,
} from "@/lib/adresseLivraison";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
type AdresseProposee = AdresseLivraison & {
  source: "saved" | "order";
  lastUsedAt?: string;
};
const normaliser = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
const cle = cleAdresse;

export function RechercheAdresseLivraison({
  adresse,
  onChange,
}: {
  adresse: AdresseLivraison | null | undefined;
  onChange: (adresse: AdresseLivraison) => void;
}) {
  const t = useTranslations("deliveryAddress");
  const dialog = useRef<HTMLDialogElement>(null);
  const requete = useRef<AbortController | null>(null);
  const requeteGPS = useRef<AbortController | null>(null);
  const rechercheId = useId();
  const titreId = useId();
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [adresses, setAdresses] = useState<AdresseProposee[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [gpsEnCours, setGpsEnCours] = useState(false);
  const [position, setPosition] = useState<AdresseLocalisee | null>(null);
  const [erreurGPS, setErreurGPS] = useState<string | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    dialog.current?.querySelector("input")?.focus();
    const ancien = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = ancien;
    };
  }, [ouvert]);
  useEffect(
    () => () => {
      requete.current?.abort();
      requeteGPS.current?.abort();
    },
    [],
  );

  const charger = async () => {
    requete.current?.abort();
    const recentes: AdresseProposee[] = lireAdressesRecentes().map(
      (recente) => ({ ...recente, source: "saved" }),
    );
    setAdresses(recentes);
    setErreur(false);
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setChargement(false);
      return;
    }
    const controleur = new AbortController();
    requete.current = controleur;
    setChargement(true);
    try {
      const reponse = await fetch(`${API_URL}/api/client/me/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controleur.signal,
      });
      if (!reponse.ok) throw new Error();
      const donnees = await reponse.json();
      if (!controleur.signal.aborted) {
        const fusion = new Map<string, AdresseProposee>();
        for (const proposee of [
          ...recentes,
          ...(donnees.data || []),
        ] as AdresseProposee[]) {
          const connue = fusion.get(cle(proposee));
          if (
            !connue ||
            Date.parse(proposee.lastUsedAt || "") >
              Date.parse(connue.lastUsedAt || "")
          )
            fusion.set(cle(proposee), proposee);
        }
        setAdresses([...fusion.values()]);
      }
    } catch {
      if (!controleur.signal.aborted) setErreur(true);
    } finally {
      if (!controleur.signal.aborted) setChargement(false);
    }
  };

  const ouvrir = () => {
    setSaisie("");
    setGpsEnCours(false);
    requeteGPS.current?.abort();
    setPosition(null);
    setErreurGPS(null);
    dialog.current?.showModal();
    setOuvert(true);
    void charger();
  };
  const retenir = (choisie: AdresseLivraison) => {
    enregistrerAdresseLivraison(choisie);
    onChange(choisie);
    dialog.current?.close();
  };
  const parGPS = async () => {
    requeteGPS.current?.abort();
    const controleur = new AbortController();
    requeteGPS.current = controleur;
    setGpsEnCours(true);
    setPosition(null);
    setErreurGPS(null);
    try {
      const trouvee = await localiserAdresse(controleur.signal);
      if (!controleur.signal.aborted) setPosition(trouvee);
    } catch (error) {
      if (!controleur.signal.aborted)
        setErreurGPS(
          error instanceof Error ? error.message : "cantAccessLocation",
        );
    } finally {
      if (!controleur.signal.aborted) setGpsEnCours(false);
    }
  };

  const toutes = new Map(adresses.map((proposee) => [cle(proposee), proposee]));
  if (adresse?.street) {
    const connue = toutes.get(cle(adresse));
    toutes.set(cle(adresse), {
      ...adresse,
      ...connue,
      latitude: connue?.latitude ?? adresse.latitude,
      longitude: connue?.longitude ?? adresse.longitude,
      source: connue?.source ?? "saved",
      lastUsedAt: connue?.lastUsedAt || new Date(0).toISOString(),
    });
  }
  const recherche = normaliser(saisie);
  const visibles = [...toutes.values()]
    .sort(
      (a, b) =>
        (Date.parse(b.lastUsedAt || "") || 0) -
        (Date.parse(a.lastUsedAt || "") || 0),
    )
    .slice(0, 5)
    .filter((proposee) =>
      normaliser(
        `${proposee.label} ${proposee.street} ${proposee.city} ${proposee.postalCode}`,
      ).includes(recherche),
    );

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        className="mb-5 flex w-full items-center gap-3 rounded-full border border-gray-200 bg-gray-50 px-5 py-4 text-left text-gray-900 transition-colors hover:bg-gray-100 focus-visible:outline-orange-500"
      >
        <Search size={22} className="shrink-0 text-orange-600" />
        <span className="min-w-0 flex-1 truncate">
          {adresse ? (
            <>
              <span className="text-gray-500">{t("deliverTo")} </span>
              <span className="font-semibold">{adresse.label}</span>
            </>
          ) : (
            t("searchAddress")
          )}
        </span>
        <ChevronDown size={20} className="shrink-0 text-gray-500" />
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={titreId}
        onClose={() => {
          setOuvert(false);
          requete.current?.abort();
          requeteGPS.current?.abort();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            event.currentTarget.close();
        }}
        className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-3xl bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-black/40"
      >
        {ouvert && (
          <div className="p-5 sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 id={titreId} className="text-2xl font-bold sm:text-3xl">
                {t("addresses")}
              </h2>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                aria-label={t("close")}
                className="rounded-full p-2 hover:bg-gray-100"
              >
                <X size={24} />
              </button>
            </div>
            <div className="relative mb-5">
              <Search
                size={22}
                className="pointer-events-none absolute left-4 top-4 z-10 text-gray-500"
              />
              <label htmlFor={rechercheId} className="sr-only">
                {t("searchAddress")}
              </label>
              <AddressAutocomplete
                id={rechercheId}
                clair
                value={saisie}
                onChange={(texte) => {
                  setSaisie(texte);
                  setPosition(null);
                  setErreurGPS(null);
                  requeteGPS.current?.abort();
                  setGpsEnCours(false);
                }}
                placeholder={t("searchAddress")}
                className="w-full rounded-full bg-gray-100 py-4 pl-12 pr-5 text-base outline-none focus:ring-2 focus:ring-orange-500"
                onSelect={(choisie) =>
                  retenir({
                    ...choisie,
                    label:
                      [choisie.street, choisie.city]
                        .filter(Boolean)
                        .join(", ") || choisie.label,
                  })
                }
              />
            </div>
            <button
              type="button"
              onClick={parGPS}
              disabled={gpsEnCours}
              className="mb-5 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium hover:bg-orange-50 disabled:opacity-50"
            >
              <Navigation size={20} className="text-orange-600" />
              {gpsEnCours ? t("locating") : t("myLocation")}
            </button>
            {erreurGPS && (
              <p role="alert" className="mb-4 text-sm text-orange-800">
                {t(erreurGPS)}
              </p>
            )}
            {position && (
              <ConfirmationAdresseLocalisee
                position={position}
                onConfirm={() => retenir(position.adresse)}
                onCorrect={() => {
                  setSaisie(
                    [position.adresse.street, position.adresse.city]
                      .filter(Boolean)
                      .join(", "),
                  );
                  setPosition(null);
                  dialog.current?.querySelector("input")?.focus();
                }}
              />
            )}
            {chargement && (
              <p role="status" className="py-3 text-sm text-gray-500">
                {t("loadingAddresses")}
              </p>
            )}
            {erreur && (
              <div
                role="status"
                className="mb-4 rounded-xl bg-orange-50 p-3 text-sm"
              >
                <p>{t("loadAddressesError")}</p>
                <button
                  type="button"
                  onClick={() => void charger()}
                  className="mt-2 font-semibold underline"
                >
                  {t("retry")}
                </button>
              </div>
            )}
            {visibles.length > 0 && (
              <section className="mb-5">
                <h3 className="mb-2 text-lg font-bold">
                  {t("recentAddresses")}
                </h3>
                <ul className="divide-y divide-gray-100">
                  {visibles.map((proposee) => (
                    <li key={cle(proposee)}>
                      <button
                        type="button"
                        onClick={() => retenir(proposee)}
                        className={`flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left hover:bg-gray-100 ${adresse && cle(adresse) === cle(proposee) ? "bg-orange-50" : ""}`}
                      >
                        {proposee.source === "saved" ? (
                          <MapPin
                            size={22}
                            className="shrink-0 text-gray-500"
                          />
                        ) : (
                          <Clock size={22} className="shrink-0 text-gray-500" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-semibold">
                            {proposee.street}
                          </span>
                          <span className="block text-sm text-gray-500">
                            {[proposee.postalCode, proposee.city]
                              .filter(Boolean)
                              .join(" ")}
                          </span>
                        </span>
                        {adresse && cle(adresse) === cle(proposee) && (
                          <Check
                            size={20}
                            aria-label={t("selectedAddress")}
                            className="shrink-0 text-orange-600"
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!chargement && !erreur && visibles.length === 0 && (
              <p className="py-4 text-sm text-gray-500">
                {t(recherche ? "noMatchingAddresses" : "noSavedAddresses")}
              </p>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
