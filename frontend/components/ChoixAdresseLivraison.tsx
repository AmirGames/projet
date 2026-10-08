"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, MapPin, Navigation } from "lucide-react";

import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { ConfirmationAdresseLocalisee } from "@/components/ConfirmationAdresseLocalisee";
import {
  localiserAdresse,
  type AdresseLocalisee,
} from "@/lib/localisation-adresse";
import {
  enregistrerAdresseLivraison,
  type AdresseLivraison,
} from "@/lib/adresseLivraison";

interface Props {
  /** `undefined` tant que le navigateur n'a pas été lu, `null` sans adresse. */
  adresse: AdresseLivraison | null | undefined;
  onChange: (adresse: AdresseLivraison) => void;
  /**
   * Sans adresse : le champ s'affiche d'emblée (accueil), ou un simple
   * bouton invite à la saisir (vitrine d'un commerce).
   */
  saisieOuverteSansAdresse?: boolean;
  /** Sur fond blanc (vitrine) : bordures et bouton sombres au lieu du blanc sur couleur. */
  clair?: boolean;
}

/**
 * L'adresse de livraison, à la manière des grandes plateformes : un champ
 * avec suggestions tant qu'elle n'est pas choisie, puis une pastille
 * « Livrer à … » qu'on touche pour la changer.
 *
 * Le choix est enregistré dans le navigateur : il vaut pour l'accueil, les
 * vitrines et le tunnel de commande.
 */
export function ChoixAdresseLivraison({
  adresse,
  onChange,
  saisieOuverteSansAdresse = false,
  clair = false,
}: Props) {
  const t = useTranslations("deliveryAddress");
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [position, setPosition] = useState<AdresseLocalisee | null>(null);
  const [gpsEnCours, setGpsEnCours] = useState(false);
  const [erreurGPS, setErreurGPS] = useState<string | null>(null);
  const requeteGPS = useRef<AbortController | null>(null);
  useEffect(() => () => requeteGPS.current?.abort(), []);

  if (adresse === undefined) return null;

  const retenir = (choisie: AdresseLivraison) => {
    enregistrerAdresseLivraison(choisie);
    setSaisie("");
    setEdition(false);
    setPosition(null);
    setGpsEnCours(false);
    requeteGPS.current?.abort();
    onChange(choisie);
  };

  const parGPS = async () => {
    requeteGPS.current?.abort();
    const controleur = new AbortController();
    requeteGPS.current = controleur;
    setPosition(null);
    setErreurGPS(null);
    setGpsEnCours(true);
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

  const saisieVisible =
    edition || (adresse === null && saisieOuverteSansAdresse);

  if (saisieVisible) {
    return (
      <div className="flex-1 space-y-3">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <MapPin
              className="absolute left-4 top-3 z-10 text-gray-400 pointer-events-none"
              size={20}
            />
            <AddressAutocomplete
              clair
              value={saisie}
              onChange={(texte) => {
                setSaisie(texte);
                setPosition(null);
                setErreurGPS(null);
                requeteGPS.current?.abort();
                setGpsEnCours(false);
              }}
              onSelect={(choisie) =>
                retenir({
                  label:
                    [choisie.street, choisie.city].filter(Boolean).join(", ") ||
                    choisie.label,
                  street: choisie.street,
                  city: choisie.city,
                  postalCode: choisie.postalCode,
                  latitude: choisie.latitude,
                  longitude: choisie.longitude,
                })
              }
              placeholder={t("placeholder")}
              className={`w-full pl-12 pr-4 py-3 rounded-lg text-gray-900 focus:outline-hidden ${clair ? "border border-gray-300 focus:border-gray-900" : ""}`}
            />
          </div>
          <button
            type="button"
            onClick={parGPS}
            disabled={gpsEnCours}
            className={`font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2 ${
              clair
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-white text-red-600 hover:bg-orange-50"
            }`}
          >
            <Navigation size={18} />
            {t(gpsEnCours ? "locating" : "myLocation")}
          </button>
          {(adresse || !saisieOuverteSansAdresse) && (
            <button
              type="button"
              onClick={() => {
                setSaisie("");
                setEdition(false);
                setPosition(null);
                requeteGPS.current?.abort();
                setGpsEnCours(false);
              }}
              className={`py-3 px-4 rounded-lg ${clair ? "text-gray-600 hover:bg-gray-100" : "text-white/90 hover:bg-white/10"}`}
            >
              {t("cancel")}
            </button>
          )}
        </div>
        {erreurGPS && (
          <p role="alert" className="text-sm text-orange-800">
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
            }}
          />
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEdition(true)}
      title={t("change")}
      className={`flex items-center gap-2 text-gray-900 py-3 px-4 rounded-full max-w-full ${
        clair ? "bg-gray-100 hover:bg-gray-200" : "bg-white hover:bg-orange-50"
      }`}
    >
      <MapPin size={18} className="text-red-600 shrink-0" />
      {adresse ? (
        <>
          <span className="text-gray-500 shrink-0">{t("deliverTo")}</span>
          <span className="font-semibold truncate">{adresse.label}</span>
        </>
      ) : (
        <span className="font-semibold">{t("enterAddress")}</span>
      )}
      <ChevronDown size={18} className="shrink-0" />
    </button>
  );
}
