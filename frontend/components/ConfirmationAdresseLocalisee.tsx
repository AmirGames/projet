"use client";

import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import type { AdresseLocalisee } from "@/lib/localisation-adresse";

export function ConfirmationAdresseLocalisee({
  position,
  onConfirm,
  onCorrect,
}: {
  position: AdresseLocalisee;
  onConfirm: () => void;
  onCorrect: () => void;
}) {
  const t = useTranslations("deliveryAddress");
  return (
    <div
      className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-gray-900"
      role="status"
    >
      <p className="mb-2 font-semibold">{t("detectedAddress")}</p>
      <div className="flex items-start gap-3">
        <MapPin size={20} className="mt-1 shrink-0 text-orange-600" />
        <div>
          <p className="font-semibold">{position.adresse.street}</p>
          <p className="text-sm">
            {[position.adresse.postalCode, position.adresse.city]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm">{t("verifyLocationAddress")}</p>
      {position.accuracy !== null && (
        <p className="mt-1 text-sm text-gray-600">
          {t("locationAccuracy", { meters: Math.ceil(position.accuracy) })}
        </p>
      )}
      {(position.accuracy === null || position.accuracy > 50) && (
        <p className="mt-1 text-sm font-medium text-orange-800">
          {t("locationImprecise")}
        </p>
      )}
      {!position.hasHouseNumber && (
        <p className="mt-1 text-sm font-medium text-orange-800">
          {t("locationMissingNumber")}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!position.hasHouseNumber}
          className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
        >
          {t("useDetectedAddress")}
        </button>
        <button
          type="button"
          onClick={onCorrect}
          className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50"
        >
          {t("correctLocationAddress")}
        </button>
      </div>
    </div>
  );
}
