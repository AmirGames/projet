'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowDownRight,
  ArrowRight,
  Bike,
  Check,
  ChevronRight,
  Clock3,
  Menu,
  PackageCheck,
  ShoppingBag,
  Store,
  X,
} from 'lucide-react';
import Link from '@/components/LienRegional';
import { EnTeteMarque } from '@/components/EnTeteMarque';
import { FooterZupEatPro } from '@/components/FooterZupEatPro';
import { useAuth } from '@/lib/auth-context';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { jetonAcces } from '@/lib/jeton-session';
import { signalerErreur } from '@/lib/erreurs';
import { accueilDe, lienVersEspace } from '@/lib/domaines';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Home() {
  const t = useTranslations('accueilPro');
  const { user, isLoading } = useAuth();
  const [roles, setRoles] = useState<any>(null);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [menuOuvert, setMenuOuvert] = useState(false);

  const fetchRoles = async () => {
    try {
      const token = jetonAcces();
      if (!token) return;

      const response = await fetch(`${API_URL}/api/auth/me/roles`, {
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

  useEffectChargement(() => {
    if (isLoading) return;
    if (user) fetchRoles();
    else setRolesLoading(false);
  }, [user, isLoading]);

  const isMerchant = roles?.merchant?.active ?? false;
  const isDriver = roles?.driver?.active ?? false;
  const lienBoutique = user ? '/dashboard' : '/signup';
  const liensNavigation = [
    { href: accueilDe('public'), label: t('commerces') },
    ...(!user || (!isMerchant && !rolesLoading)
      ? [{ href: '/devenir-commercant', label: t('devenirCommercant') }]
      : []),
    ...(!user || (!isDriver && !rolesLoading)
      ? [{ href: lienVersEspace('livreur', '/devenir-livreur'), label: t('devenirLivreur') }]
      : []),
  ];

  const publics = [
    {
      icon: ShoppingBag,
      title: t('clientsTitre'),
      description: t('clientsTexte'),
      label: t('clientsLien'),
      href: accueilDe('public'),
    },
    {
      icon: Store,
      title: t('commercantsTitre'),
      description: t('commercantsTexte'),
      label: t('commercantsLien'),
      href: '/devenir-commercant',
    },
    {
      icon: Bike,
      title: t('livreursTitre'),
      description: t('livreursTexte'),
      label: t('livreursLien'),
      href: lienVersEspace('livreur', '/devenir-livreur'),
    },
  ];

  const etapes = [
    { numero: '01', titre: t('etape1Titre'), description: t('etape1'), icon: ShoppingBag },
    { numero: '02', titre: t('etape2Titre'), description: t('etape2'), icon: PackageCheck },
    { numero: '03', titre: t('etape3Titre'), description: t('etape3'), icon: Bike },
  ];

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <EnTeteMarque marque="zupeat">
        <nav aria-label={t('navigationLabel')} className="hidden items-center gap-1 lg:flex">
          {liensNavigation.map((lien) => (
            <Link
              key={lien.label}
              href={lien.href}
              className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
            >
              {lien.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {!user && (
            <Link
              href="/login"
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] sm:inline-flex"
            >
              {t('connexion')}
            </Link>
          )}
          <Link
            href={lienBoutique}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#FF7A00] px-4 py-2 text-sm font-bold text-black transition hover:bg-[#E66E00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 sm:px-5"
          >
            {user ? t('monEspace') : t('creerBoutique')}
          </Link>
          <button
            type="button"
            aria-label={menuOuvert ? t('fermerMenu') : t('ouvrirMenu')}
            aria-expanded={menuOuvert}
            aria-controls="navigation-mobile"
            onClick={() => setMenuOuvert((ouvert) => !ouvert)}
            className="grid size-11 place-items-center rounded-full border border-neutral-200 text-black transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] lg:hidden"
          >
            {menuOuvert ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </EnTeteMarque>

      {menuOuvert && (
        <nav
          id="navigation-mobile"
          aria-label={t('navigationLabel')}
          className="relative z-30 border-b border-neutral-200 bg-white p-4 shadow-lg lg:hidden"
        >
          <div className="mx-auto grid max-w-7xl gap-1">
            {liensNavigation.map((lien) => (
              <Link
                key={lien.label}
                href={lien.href}
                onClick={() => setMenuOuvert(false)}
                className="flex min-h-12 items-center justify-between rounded-xl px-4 text-sm font-semibold text-neutral-800 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
              >
                {lien.label}<ChevronRight size={17} aria-hidden="true" />
              </Link>
            ))}
            {!user && (
              <Link
                href="/login"
                onClick={() => setMenuOuvert(false)}
                className="flex min-h-12 items-center rounded-xl px-4 text-sm font-semibold text-neutral-800 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
              >
                {t('connexion')}
              </Link>
            )}
          </div>
        </nav>
      )}

      <main>
        <section className="relative isolate overflow-hidden bg-[#FFF8F1]">
          <div aria-hidden="true" className="absolute -right-40 -top-36 size-[34rem] rounded-full bg-orange-200/40 blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-48 -left-40 size-[32rem] rounded-full bg-white/90 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.02fr_.98fr] lg:gap-14 lg:px-10 lg:py-24">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-4 py-2 text-sm font-bold text-neutral-800 shadow-sm">
                <span aria-hidden="true" className="size-2 rounded-full bg-[#FF7A00]" />
                {t('badge')}
              </span>
              <h1 className="mt-6 text-[2.65rem] font-black leading-[1.02] tracking-[-.055em] sm:text-5xl lg:text-[4.2rem]">
                {t('titre')}
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8">
                {t('intro')}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={lienBoutique}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#FF7A00] px-7 text-base font-bold text-black shadow-[0_8px_24px_rgba(255,122,0,.2)] transition hover:-translate-y-0.5 hover:bg-[#E66E00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                >
                  {user ? t('monEspace') : t('creerGratuit')}<ArrowRight size={18} aria-hidden="true" />
                </Link>
                <Link
                  href={accueilDe('public')}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-black px-7 text-base font-bold text-white transition hover:-translate-y-0.5 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] focus-visible:ring-offset-2"
                >
                  {t('voirCommerces')}<ArrowDownRight size={17} aria-hidden="true" />
                </Link>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-neutral-600">
                {[t('heroProofOne'), t('heroProofTwo'), t('heroProofThree')].map((point) => (
                  <span key={point} className="inline-flex items-center gap-2">
                    <Check size={16} className="text-[#B94F00]" aria-hidden="true" />{point}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[38rem] lg:max-w-none">
              <div className="relative aspect-[1.18] overflow-hidden rounded-[2rem] bg-neutral-200 shadow-[0_28px_70px_rgba(24,24,27,.16)] sm:rounded-[2.5rem]">
                <Image
                  src="/images/shops-redesign/boulangerie.webp"
                  alt={t('heroImageAlt')}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 48vw"
                  className="object-cover transition duration-700 hover:scale-[1.025]"
                />
                <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/5" />
                <p className="absolute bottom-5 left-5 right-5 text-sm font-semibold text-white drop-shadow sm:bottom-7 sm:left-7 sm:text-base">
                  {t('heroImageCaption')}
                </p>
              </div>
              <div className="absolute -bottom-5 left-3 max-w-[17rem] rounded-2xl border border-neutral-100 bg-white p-4 shadow-xl sm:-left-7 sm:bottom-7 sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#FF7A00] text-xl font-black text-black" aria-hidden="true">Z</span>
                  <div>
                    <p className="text-sm font-extrabold tracking-tight">Zup<span className="text-[#FF7A00]">Eat</span></p>
                    <p className="mt-0.5 text-xs text-neutral-500">{t('heroCardTitle')}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-neutral-700">
                  <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />{t('heroCardCaption')}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[.14em] text-[#B94F00]">{t('solutionsEyebrow')}</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">{t('solutionsTitle')}</h2>
            <p className="mt-4 text-base leading-7 text-neutral-600">{t('solutionsIntro')}</p>
          </div>
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {publics.map(({ icon: Icon, title, description, label, href }) => (
              <article key={title} className="group flex min-h-64 flex-col rounded-[1.75rem] border border-neutral-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-orange-200 hover:shadow-[0_18px_45px_rgba(0,0,0,.07)] sm:p-7">
                <span className="grid size-12 place-items-center rounded-2xl bg-orange-50 text-[#B94F00] transition group-hover:bg-[#FF7A00] group-hover:text-black">
                  <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-extrabold tracking-tight">{title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-neutral-600">{description}</p>
                <Link href={href} className="mt-5 inline-flex w-fit items-center gap-2 rounded-sm text-sm font-bold text-black transition hover:text-[#B94F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
                  {label}<ArrowRight size={16} aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-[#F7F7F5]">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:px-10">
            <div className="max-w-lg">
              <p className="text-sm font-bold uppercase tracking-[.14em] text-[#B94F00]">{t('operationsEyebrow')}</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">{t('operationsTitle')}</h2>
              <p className="mt-4 leading-7 text-neutral-600">{t('operationsIntro')}</p>
              <Link href="/devenir-commercant" className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-black px-6 font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] focus-visible:ring-offset-2">
                {t('devenirCommercant')}<ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: Store, title: t('catalogueTitle'), text: t('catalogueText') },
                { icon: PackageCheck, title: t('ordersTitle'), text: t('ordersText') },
                { icon: Clock3, title: t('scheduleTitle'), text: t('scheduleText') },
                { icon: Bike, title: t('deliveryTitle'), text: t('deliveryText') },
              ].map(({ icon: Icon, title, text: description }) => (
                <article key={title} className="rounded-2xl border border-neutral-200/80 bg-white p-5 sm:p-6">
                  <Icon size={21} className="text-[#B94F00]" aria-hidden="true" />
                  <h3 className="mt-4 font-extrabold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-[.14em] text-[#B94F00]">{t('howEyebrow')}</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">{t('comment')}</h2>
            <p className="mt-4 leading-7 text-neutral-600">{t('howIntro')}</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {etapes.map(({ numero, titre, description, icon: Icon }) => (
              <article key={numero} className="relative rounded-[1.75rem] border border-neutral-200 p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black tracking-[.12em] text-[#B94F00]">{numero}</span>
                  <span className="grid size-11 place-items-center rounded-2xl bg-orange-50 text-[#B94F00]"><Icon size={21} aria-hidden="true" /></span>
                </div>
                <h3 className="mt-7 text-xl font-extrabold tracking-tight">{titre}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 sm:pb-24 lg:px-10">
          <div className="relative isolate overflow-hidden rounded-[2rem] bg-black px-6 py-10 text-white sm:px-10 sm:py-14 lg:rounded-[2.5rem] lg:px-14">
            <div aria-hidden="true" className="absolute -right-16 -top-32 size-96 rounded-full bg-[#FF7A00]/20 blur-3xl" />
            <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-black tracking-[-.045em] sm:text-4xl">{t('ctaTitre')}</h2>
                <p className="mt-4 leading-7 text-white/75">{t('ctaTexte')}</p>
              </div>
              <Link href={lienBoutique} className="inline-flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-full bg-[#FF7A00] px-7 font-bold text-black transition hover:-translate-y-0.5 hover:bg-[#E66E00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black">
                {user ? t('monEspace') : t('creerBoutique')}<ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <FooterZupEatPro />
    </div>
  );
}

