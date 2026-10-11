"use client";


import { poserJeton } from '@/lib/jeton-session';
import { signalerErreur } from '@/lib/erreurs';
import { useState } from "react";
import AcceptationConditions from '@/components/AcceptationConditions';
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import ReglesMotDePasse from "@/components/ReglesMotDePasse";
import { motDePasseValide } from "@/lib/mot-de-passe";
import { api } from "@/lib/api";
import { confierSessionCentrale } from "@/lib/sso";
import Link from "next/link";
import { SelecteurPays } from "@/components/SelecteurPays";
import { usePays } from "@/lib/pays-client";
import { LogoConnexion, type MarqueConnexion } from '@/components/auth/LogoConnexion';

export default function SignupForm({ marque }: { marque: MarqueConnexion }) {
  const t = useTranslations('auth.signup');
  const [aConfirmer, setAConfirmer] = useState(false);
  const tMdp = useTranslations('motDePasse');
  const tConditions = useTranslations('acceptationConditions');
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

    if (!motDePasseValide(password)) {
      setError(tMdp("invalide"));
      return;
    }

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

      // Confirmation d'adresse exigée : pas de session avant le clic sur le lien.
      if (result.emailVerificationRequired) {
        setError("");
        setAConfirmer(true);
        return;
      }

      // Save tokens and user role
      poserJeton(result.accessToken);
      // L'inscription ne dit pas les droits d'administration : /auth/me les
      // donne à qui est connecté (le premier compte devient superowner).
      const moi = await api.getMe().catch(() => null);
      localStorage.setItem("isSuperOwner", moi?.user?.isSuperOwner ? "true" : "false");

      setError("");

      // Redirect to role selection to choose customer/merchant/driver roles —
      // en passant par zupone.com, qui garde la session pour les autres domaines.
      if (await confierSessionCentrale(result.accessToken, "/auth/role-selection")) return;
      router.push("/auth/role-selection");
    } catch (err) {
      setError(t("error"));
      signalerErreur(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top_left,_#fff0df_0,_#faf9f7_44%,_#f5f5f4_100%)] px-5 py-10 sm:px-6">
      <div className="w-full max-w-md rounded-[2rem] border border-black/5 bg-white p-7 shadow-[0_24px_80px_-36px_rgba(0,0,0,.28)] md:p-10">
        <LogoConnexion marque={marque} />
        <h1 className="mb-6 text-center text-3xl font-extrabold tracking-tight text-gray-900">
          {t("title")}
        </h1>

        {aConfirmer && (
          <div className="bg-green-50 border border-green-200 text-green-900 p-4 rounded-lg mb-4" role="status">
            {t("checkEmail")}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label htmlFor="pays" className="mb-1.5 block text-sm font-semibold text-gray-700">{t('pays')}</label>
            <SelecteurPays
              pays={pays}
              onChange={setPays}
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 transition focus:border-[#FF7A00] focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/20"
            />
          </div>

          <div>
            <label htmlFor="signup-name" className="mb-1.5 block text-sm font-semibold text-gray-700">{t("name")}</label>
            <input
              id="signup-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 transition focus:border-[#FF7A00] focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/20"
              placeholder={t("name")}
              required
            />
          </div>

          <div>
            <label htmlFor="signup-email" className="mb-1.5 block text-sm font-semibold text-gray-700">{t("email")}</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 transition focus:border-[#FF7A00] focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/20"
              placeholder={t('emailPlaceholder')}
              required
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="mb-1.5 block text-sm font-semibold text-gray-700">{t("password")}</label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 transition focus:border-[#FF7A00] focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/20"
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />
            <ReglesMotDePasse valeur={password} />
          </div>

          <div>
            <label htmlFor="signup-password-confirm" className="mb-1.5 block text-sm font-semibold text-gray-700">{t("confirmPassword")}</label>
            <input
              id="signup-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 transition focus:border-[#FF7A00] focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/20"
              placeholder="••••••••"
              required
            />
          </div>

          <AcceptationConditions
            clair
            coche={conditionsAcceptees}
            onChange={setConditionsAcceptees}
            documents={[
              { href: "/cgu", libelle: tConditions('docs.cgu') },
              { href: "/cgv", libelle: tConditions('docs.cgv') },
            ]}
          />

          <button
            type="submit"
            disabled={loading || !conditionsAcceptees}
            className="w-full rounded-full bg-[#FF7A00] px-4 py-3.5 font-bold text-black transition hover:bg-[#E66E00] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
          >
            {loading ? t("registering") : t("submit")}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-slate-600">
            {t("haveAccount")}{" "}
            <Link href="/login" className="font-semibold text-gray-900 underline underline-offset-4 transition hover:text-gray-600">
              {t("login")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}


