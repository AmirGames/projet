"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { RAISON_DECONNEXION, useAuth } from "@/lib/auth-context";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function LoginPage() {
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
    setLienRenvoye("Envoi...");

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
      const orgId = result.organization?.id;
      if (orgId) {
        localStorage.setItem("currentOrgId", orgId);
      }

      // Le commerçant choisit son commerce depuis /merchant plutôt que
      // d'être envoyé d'office sur une boutique.
      const redirectPath = result.user?.isSuperOwner
        ? "/superowner"
        : orgId
          ? "/merchant"
          : "/login";

      // Sans cela le contexte reste sur l'état déconnecté et les pages
      // protégées renvoient aussitôt vers /login.
      await refreshAuth();

      router.push(redirectPath);
    } catch (err) {
      setError("Erreur de connexion");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">
          Connexion
        </h1>

        {raison && !error && (
          <div
            role="status"
            className="bg-amber-600/20 border border-amber-600/50 text-amber-200 p-4 rounded-lg mb-4"
          >
            {raison}
          </div>
        )}

        {error && (
          <div className="bg-red-600 text-white p-4 rounded-lg mb-4">
            <p>{error}</p>

            {adresseNonConfirmee && (
              <div className="mt-3 pt-3 border-t border-red-400/50 text-sm">
                {lienRenvoye ? (
                  <p>{lienRenvoye}</p>
                ) : (
                  <button
                    type="button"
                    onClick={renvoyerConfirmation}
                    className="underline hover:no-underline font-medium"
                  >
                    Renvoyer le lien de confirmation
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-gray-300 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <p>
            <Link
              href="/mot-de-passe-oublie"
              className="text-blue-400 hover:text-blue-300"
            >
              Mot de passe oublié ?
            </Link>
          </p>
          <p className="text-gray-400">
            Pas encore inscrit?{" "}
            <Link href="/signup" className="text-blue-400 hover:text-blue-300">
              S'inscrire
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}