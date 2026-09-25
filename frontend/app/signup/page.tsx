"use client";

import { useState } from "react";
import AcceptationConditions from '@/components/AcceptationConditions';
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import Link from "next/link";
import { SelecteurPays } from "@/components/SelecteurPays";
import { usePays } from "@/lib/pays-client";

export default function SignupPage() {
  const t = useTranslations('auth.signup');
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [conditionsAcceptees, setConditionsAcceptees] = useState(false);
  // Retenu pour la suite : les adresses de livraison de ce pays passent en tête.
  const [pays, setPays] = usePays();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("passwordsMismatch"));
      return;
    }

    setLoading(true);

    try {
      const result = await api.signup(email, password, name, conditionsAcceptees);

      if (result.error) {
        setError(result.error || result.message || t("error"));
        return;
      }

      // Save tokens and user role
      localStorage.setItem("accessToken", result.accessToken);
      localStorage.setItem("refreshToken", result.refreshToken);
      localStorage.setItem("isSuperOwner", result.user?.isSuperOwner ? "true" : "false");

      setError("");

      // Redirect to role selection to choose customer/merchant/driver roles
      router.push("/auth/role-selection");
    } catch (err) {
      setError(t("error"));
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label htmlFor="pays" className="block text-slate-700 font-medium mb-2">Pays</label>
            <SelecteurPays
              pays={pays}
              onChange={setPays}
              className="w-full px-4 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-2">{t("name")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={t("name")}
              required
            />
          </div>

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

          <div>
            <label className="block text-slate-700 font-medium mb-2">{t("confirmPassword")}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="••••••••"
              required
            />
          </div>

          <AcceptationConditions
            clair
            coche={conditionsAcceptees}
            onChange={setConditionsAcceptees}
            documents={[
              { href: "/cgu", libelle: "les conditions générales d’utilisation" },
              { href: "/cgv", libelle: "les conditions générales de vente" },
            ]}
          />

          <button
            type="submit"
            disabled={loading || !conditionsAcceptees}
            className="w-full bg-accent hover:bg-accent-hover text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition"
          >
            {loading ? t("registering") : t("submit")}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-slate-600">
            {t("haveAccount")}{" "}
            <Link href="/login" className="text-primary hover:text-primary-hover font-medium transition">
              {t("login")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}