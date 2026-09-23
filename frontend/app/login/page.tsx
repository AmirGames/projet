"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { RAISON_DECONNEXION, useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const { refreshAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [adresseNonConfirmee, setAdresseNonConfirmee] = useState(false);
  const [lienRenvoye, setLienRenvoye] = useState("");
  const [raison, setRaison] = useState("");

  /**
   * Dire pourquoi on a été déconnecté.
   *
   * Sans cela, une session périmée ramenait à un formulaire vide, sans un mot :
   * l'utilisateur croyait à une panne. Le message est lu une fois puis retiré,
   * sinon il réapparaîtrait à chaque visite de la page.
   */
  useEffect(() => {
    try {
      const lue = sessionStorage.getItem(RAISON_DECONNEXION);

      if (lue) {
        setRaison(lue);
        sessionStorage.removeItem(RAISON_DECONNEXION);
      }
    } catch {
      // Stockage refusé : on se passe du message.
    }
  }, []);

  const renvoyerConfirmation = async () => {
    setLienRenvoye(t("resending"));

    try {
      const reponse = await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const donnees = await reponse.json();
      setLienRenvoye(donnees.message || donnees.error || "Demande envoyée.");
    } catch {
      setLienRenvoye("Serveur injoignable. Réessayez dans un instant.");
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
      localStorage.setItem("accessToken", result.accessToken);
      localStorage.setItem("refreshToken", result.refreshToken);
      localStorage.setItem("isSuperOwner", result.user?.isSuperOwner ? "true" : "false");

      console.log("Tokens saved:", {
        hasAccessToken: !!localStorage.getItem("accessToken"),
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

      // Redirect based on role
      if (isSuperOwner) {
        router.push("/superowner");
      } else {
        router.push("/auth/role-selection");
      }
    } catch (err) {
      setError(t("errorConnection"));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6 py-12">
      <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-slate-900 mb-6 text-center">
          {t("title")}
        </h1>

        {raison && !error && (
          <div
            role="status"
            className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-lg mb-4"
          >
            {raison}
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

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-slate-700 font-medium mb-2">{t("email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-2">{t("password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition"
          >
            {loading ? t("connecting") : t("submit")}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <p>
            <Link
              href="/mot-de-passe-oublie"
              className="text-primary hover:text-primary-hover font-medium transition"
            >
              {t("forgotPassword")}
            </Link>
          </p>
          <p className="text-slate-600">
            {t("noAccount")}{" "}
            <Link href="/signup" className="text-primary hover:text-primary-hover font-medium transition">
              {t("signup")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}