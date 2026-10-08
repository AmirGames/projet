"use client";


import { jetonAcces, poserJeton } from '@/lib/jeton-session';
import { signalerErreur } from '@/lib/erreurs';
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { RAISON_DECONNEXION, useAuth } from "@/lib/auth-context";
import { confierSessionCentrale, demanderSessionCentrale } from "@/lib/sso";
import Link from "next/link";
import { destinationApresConnexion } from "@/lib/espace-utilisateur";
import AccesDemo from "@/components/AccesDemo";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const sansAbonnement = () => () => {};

function lireRaison(): string | null {
  try {
    return sessionStorage.getItem(RAISON_DECONNEXION);
  } catch {
    // Stockage refusé : on se passe du message.
    return null;
  }
}

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const { refreshAuth, isAuthenticated, isLoading, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [adresseNonConfirmee, setAdresseNonConfirmee] = useState(false);
  const [lienRenvoye, setLienRenvoye] = useState("");

  /**
   * Dire pourquoi on a été déconnecté.
   *
   * Sans cela, une session périmée ramenait à un formulaire vide, sans un mot :
   * l'utilisateur croyait à une panne. Le message est lu une fois, gardé pour
   * la visite, puis retiré du stockage : il ne réapparaît pas à la suivante.
   */
  const raisonStockee = useSyncExternalStore(sansAbonnement, lireRaison, () => null);
  const [raison, setRaison] = useState("");
  if (raisonStockee && raisonStockee !== raison) setRaison(raisonStockee);

  /**
   * Déjà connecté sur un autre domaine du site ? zupone.com le sait : un
   * aller-retour éclair, et l'on arrive connecté, sans formulaire. Pas après
   * une session qui vient d'expirer — elle l'est partout, et le message qui
   * l'explique se perdrait dans le détour.
   */
  // Retour ici une fois la session reçue : l'effet « déjà connecté »
  // ci-dessous choisit alors l'espace, selon le domaine et le compte.
  useEffect(() => {
    if (!raisonStockee) demanderSessionCentrale(window.location.pathname + window.location.search);
  }, [raisonStockee]);

  useEffect(() => {
    if (!raisonStockee) return;
    try {
      sessionStorage.removeItem(RAISON_DECONNEXION);
    } catch {
      // Stockage refusé : rien à retirer.
    }
  }, [raisonStockee]);

  // Déjà connecté : le formulaire n'a plus rien à offrir, on rejoint son espace.
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    router.replace(
      destinationApresConnexion({
        isSuperOwner: user?.isSuperOwner,
      }),
    );
  }, [isLoading, isAuthenticated, user, router]);

  const renvoyerConfirmation = async () => {
    setLienRenvoye(t("resending"));

    try {
      const reponse = await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const donnees = await reponse.json();
      setLienRenvoye(donnees.message || donnees.error || t('demandeEnvoyee'));
    } catch {
      setLienRenvoye(t('injoignable'));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setAdresseNonConfirmee(false);
    setLienRenvoye("");

    try {
      const result = await api.login(email, password);

      if (result.error) {
        setError(result.error);
        // Un compte non confirmé n'a pas de session : sans ce bouton il n'a
        // aucun moyen de redemander son lien.
        setAdresseNonConfirmee(result.code === "EMAIL_NOT_VERIFIED");
        return;
      }

      // Save tokens
      poserJeton(result.accessToken);
      localStorage.setItem("isSuperOwner", result.user?.isSuperOwner ? "true" : "false");

      console.log("Tokens saved:", {
        hasAccessToken: !!jetonAcces(),
        isSuperOwner: result.user?.isSuperOwner,
        userId: result.user?.id,
      });

      // Redirect based on role
      const isSuperOwner = result.user?.isSuperOwner;

      // If user has an organization from login, save it
      if (result.organization?.id) {
        localStorage.setItem("currentOrgId", result.organization.id);
      }

      // Sans cela le contexte reste sur l'état déconnecté et les pages
      // protégées renvoient aussitôt vers /login.
      await refreshAuth();

      // La destination dépend du domaine ; on y va en passant par zupone.com,
      // qui garde la session pour les autres domaines du site.
      const destination = destinationApresConnexion({ isSuperOwner });
      if (await confierSessionCentrale(result.accessToken, destination)) return;
      router.replace(destination);
    } catch (err) {
      setError(t("errorConnection"));
      signalerErreur(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xs ring-1 ring-gray-200 md:p-10">
        <h1 className="mb-6 text-center text-3xl font-extrabold tracking-tight text-gray-900">
          {t("title")}
        </h1>

        {raison && !error && (
          <div
            role="status"
            className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-lg mb-4"
          >
            {t('sessionExpiree')}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-lg mb-4">
            <p>{error}</p>

            {adresseNonConfirmee && (
              <div className="mt-3 pt-3 border-t border-red-200 text-sm">
                {lienRenvoye ? (
                  <p>{lienRenvoye}</p>
                ) : (
                  <button
                    type="button"
                    onClick={renvoyerConfirmation}
                    className="underline hover:no-underline font-medium"
                  >
                    {t("resendConfirmation")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <AccesDemo
          onUtiliser={(courriel, motDePasse) => {
            setEmail(courriel);
            setPassword(motDePasse);
          }}
        />

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">{t("email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-hidden focus:ring-2 focus:ring-gray-900/10"
              placeholder={t('emailPlaceholder')}
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">{t("password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-hidden focus:ring-2 focus:ring-gray-900/10"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gray-900 px-4 py-3.5 font-bold text-white transition hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? t("connecting") : t("submit")}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <p>
            <Link
              href="/mot-de-passe-oublie"
              className="font-semibold text-gray-900 underline underline-offset-4 transition hover:text-gray-600"
            >
              {t("forgotPassword")}
            </Link>
          </p>
          <p className="text-slate-600">
            {t("noAccount")}{" "}
            <Link href="/signup" className="font-semibold text-gray-900 underline underline-offset-4 transition hover:text-gray-600">
              {t("signup")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}