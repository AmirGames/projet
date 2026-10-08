'use client';

import { signalerErreur } from '@/lib/erreurs';
import Link from '@/components/LienRegional';
import { accueilDe } from '@/lib/domaines';
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { useEffectChargement } from "@/lib/use-effect-chargement";
import { useTranslations } from 'next-intl';

export default function Home() {
  const t = useTranslations('accueilPro');
  const { user, isLoading } = useAuth();
  const [roles, setRoles] = useState<any>(null);
  const [rolesLoading, setRolesLoading] = useState(true);

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/me/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setRoles(data.roles);
      }
    } catch (error) {
      signalerErreur('Failed to fetch roles:', error);
    } finally {
      setRolesLoading(false);
    }
  };

  if (!user && rolesLoading) setRolesLoading(false);

  useEffectChargement(() => {
    if (user && !isLoading) {
      fetchRoles();
    }
  }, [user, isLoading]);

  const isMerchant = roles?.merchant?.active ?? false;
  const isDriver = roles?.driver?.active ?? false;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* HEADER */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 md:px-10">
        <Link href="/" className="text-2xl font-black text-primary md:text-3xl">
          ZupEat
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link href={accueilDe('public')} className="font-semibold text-slate-900 transition hover:text-primary">
            {t('commerces')}
          </Link>

          {!user || (!isMerchant && !rolesLoading) ? (
            <Link href="/devenir-commercant" className="font-semibold text-slate-900 transition hover:text-primary">
              {t('devenirCommercant')}
            </Link>
          ) : null}

          {!user || (!isDriver && !rolesLoading) ? (
            <Link href="/devenir-livreur" className="font-semibold text-slate-900 transition hover:text-primary">
              {t('devenirLivreur')}
            </Link>
          ) : null}

          <Link href="/devenir-chauffeur" className="font-semibold text-slate-900 transition hover:text-primary">
            {t('devenirChauffeur')}
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{t('bientot')}</span>
          </Link>

          {!user ? (
            <Link href="/login" className="font-semibold text-slate-900 transition hover:text-primary">
              {t('connexion')}
            </Link>
          ) : null}
        </nav>

        {!user ? (
          <Link
            href="/signup"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent-hover md:px-6 md:py-3 md:text-base"
          >
            {t('creerBoutique')}
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent-hover md:px-6 md:py-3 md:text-base"
          >
            {t('monEspace')}
          </Link>
        )}
      </header>

      {/* HERO */}
      <section className="bg-linear-to-b from-white to-slate-100 px-6 py-20 text-center md:py-32">
        <span className="mb-6 inline-block rounded-full bg-blue-100 px-4 py-2.5 font-bold text-primary">
          {t('badge')}
        </span>

        <h1 className="mx-auto mb-5 max-w-4xl text-4xl font-black leading-tight md:text-6xl">
          {t('titre')}
        </h1>

        <p className="mx-auto max-w-2xl text-lg text-slate-500 md:text-xl">
          {t('intro')}
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-full bg-accent px-8 py-4 font-bold text-white transition hover:bg-accent-hover"
          >
            {t('creerGratuit')}
          </Link>
          <Link
            href={accueilDe('public')}
            className="rounded-full border border-slate-200 bg-white px-8 py-4 font-bold text-slate-900 transition hover:border-slate-300"
          >
            {t('voirCommerces')}
          </Link>
        </div>
      </section>

      {/* SERVICES */}
      <section className="grid grid-cols-1 gap-8 bg-white px-6 py-16 md:grid-cols-2 lg:grid-cols-4 md:px-10 md:py-24">
        <div className="rounded-3xl border border-slate-200 p-8 transition hover:-translate-y-1 hover:shadow-[0_15px_35px_rgba(37,99,235,0.08)]">
          <div className="mb-4 text-4xl">🛍️</div>
          <h2 className="mb-2 text-xl font-bold">{t('clientsTitre')}</h2>
          <p className="mb-4 text-slate-500">
            {t('clientsTexte')}
          </p>
          <Link href={accueilDe('public')} className="font-bold text-primary">
            {t('clientsLien')}
          </Link>
        </div>

        <div className="rounded-3xl border border-slate-200 p-8 transition hover:-translate-y-1 hover:shadow-[0_15px_35px_rgba(37,99,235,0.08)]">
          <div className="mb-4 text-4xl">🏪</div>
          <h2 className="mb-2 text-xl font-bold">{t('commercantsTitre')}</h2>
          <p className="mb-4 text-slate-500">
            {t('commercantsTexte')}
          </p>
          <Link href="/devenir-commercant" className="font-bold text-primary">
            {t('commercantsLien')}
          </Link>
        </div>

        <div className="rounded-3xl border border-slate-200 p-8 transition hover:-translate-y-1 hover:shadow-[0_15px_35px_rgba(37,99,235,0.08)]">
          <div className="mb-4 text-4xl">🛵</div>
          <h2 className="mb-2 text-xl font-bold">{t('livreursTitre')}</h2>
          <p className="mb-4 text-slate-500">
            {t('livreursTexte')}
          </p>
          <Link href="/devenir-livreur" className="font-bold text-primary">
            {t('livreursLien')}
          </Link>
        </div>

        <div className="rounded-3xl border border-slate-200 p-8 transition hover:-translate-y-1 hover:shadow-[0_15px_35px_rgba(37,99,235,0.08)]">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-4xl">🚘</span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">{t('bientot')}</span>
          </div>
          <h2 className="mb-2 text-xl font-bold">{t('chauffeursTitre')}</h2>
          <p className="mb-4 text-slate-500">
            {t('chauffeursTexte')}
          </p>
          <Link href="/devenir-chauffeur" className="font-bold text-primary">
            {t('chauffeursLien')}
          </Link>
        </div>
      </section>

      {/* STATS */}
      <section className="flex flex-col justify-center gap-10 bg-slate-50 px-6 py-16 md:flex-row md:gap-24 md:py-20">
        <div className="text-center">
          <h3 className="text-4xl font-extrabold text-primary md:text-5xl">3</h3>
          <p className="text-slate-500">{t('stat1')}</p>
        </div>
        <div className="text-center">
          <h3 className="text-4xl font-extrabold text-primary md:text-5xl">83</h3>
          <p className="text-slate-500">{t('stat2')}</p>
        </div>
        <div className="text-center">
          <h3 className="text-4xl font-extrabold text-primary md:text-5xl">1978</h3>
          <p className="text-slate-500">{t('stat3')}</p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="px-6 py-20 md:px-10 md:py-24">
        <h2 className="mb-12 text-center text-3xl font-black md:text-4xl">
          {t('comment')}
        </h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 p-8">
            <span className="text-2xl font-extrabold text-primary">01</span>
            <h3 className="my-3 text-lg font-bold">{t('etape1Titre')}</h3>
            <p className="text-slate-500">
              {t('etape1')}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 p-8">
            <span className="text-2xl font-extrabold text-primary">02</span>
            <h3 className="my-3 text-lg font-bold">{t('etape2Titre')}</h3>
            <p className="text-slate-500">
              {t('etape2')}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 p-8">
            <span className="text-2xl font-extrabold text-primary">03</span>
            <h3 className="my-3 text-lg font-bold">{t('etape3Titre')}</h3>
            <p className="text-slate-500">
              {t('etape3')}
            </p>
          </div>
        </div>
      </section>

      {/* BUSINESS CTA */}
      <section className="bg-blue-50 px-6 py-24 text-center md:py-32">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-5 text-3xl font-black md:text-5xl">
            {t('ctaTitre')}
          </h2>
          <p className="mb-8 text-slate-500">
            {t('ctaTexte')}
          </p>
          <Link
            href="/devenir-commercant"
            className="inline-block rounded-full bg-accent px-8 py-4 font-bold text-white transition hover:bg-accent-hover"
          >
            {t('creerBoutique')}
          </Link>
        </div>
      </section>
    </div>
  );
}
