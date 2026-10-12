import Link from '@/components/LienRegional';
import { LienConnexion } from '@/components/LienConnexion';
import { PAYS, type Pays } from '@/lib/pays-infos';
import { MARQUES, marqueDuNom } from '@/lib/marques';
import { EnTeteMarque } from '@/components/EnTeteMarque';
import { Banknote, Bike, Bell, Clock3, MapPin, Package, Store, Truck, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EMAIL_CONTACT } from '@/lib/editeur';

const ICONES_AVANTAGE: Record<string, LucideIcon> = {
  '🕒': Clock3,
  '📍': MapPin,
  '💶': Banknote,
  '🏪': Store,
  '🔔': Bell,
  '🛵': Bike,
};

export interface Etape {
  titre: string;
  texte: string;
}

export interface Avantage {
  icone: string;
  titre: string;
  texte: string;
}

export interface Question {
  question: string;
  reponse: string;
}

export interface ContenuDevenir {
  badge: string;
  titre: string;
  accroche: string;
  cta: { libelle: string; href: string };
  avantages: Avantage[];
  etapes: Etape[];
  prerequis: string[];
  questions: Question[];
  conditions?: { libelle: string; href: string };
  /** La plateforme qui recrute : ZupEat par défaut, ZupDrive pour les chauffeurs. */
  marque?: string;
}

interface Props extends ContenuDevenir {
  pays: Pays;
  chemin: string;
}

/**
 * Page de présentation affichée avant une inscription (livreur, commerçant,
 * chauffeur) : elle explique le rôle, les étapes et les prérequis, puis
 * renvoie vers le formulaire.
 */
export function PageDevenir({
  badge,
  titre,
  accroche,
  cta,
  avantages,
  etapes,
  prerequis,
  questions,
  conditions,
  marque = 'ZupEat',
  pays,
  chemin,
}: Props) {
  const t = useTranslations('pageDevenir');
  // Le formulaire d'inscription reprend le pays affiché ici.
  const tPays = useTranslations('pays');
  const lienCta = cta.href.startsWith('/') ? `${cta.href}?pays=${pays}` : cta.href;
  const cle = marqueDuNom(marque);
  const theme = MARQUES[cle];
  const estLivreur = cta.href === '/driver/signup';
  const IconeHero = estLivreur ? Bike : cle === 'zupdrive' ? Truck : Store;
  const bouton = () => (
    <Link
      href={lienCta}
      className={`inline-flex min-h-14 items-center justify-center rounded-full px-7 py-3 text-center font-bold transition hover:-translate-y-0.5 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${theme.bouton}`}
    >
      {cta.libelle}
    </Link>
  );

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <EnTeteMarque marque={cle}>
        <nav aria-label={t('pays')} className="flex gap-1 rounded-full bg-gray-100 p-1 text-sm">
          {(Object.keys(PAYS) as Pays[]).map((code) => (
            <Link
              key={code}
              href={`${chemin}?pays=${code}`}
              aria-current={code === pays ? 'true' : undefined}
              className={`rounded-full px-3 py-1 font-semibold hover:no-underline ${
                code === pays ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {PAYS[code].drapeau} <span className="hidden sm:inline">{tPays(code)}</span>
            </Link>
          ))}
        </nav>
        {estLivreur ? (
          <Link href="/driver/login" className="rounded-full px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
            {t('connexionLivreur')}
          </Link>
        ) : <LienConnexion />}
      </EnTeteMarque>

      <main>
      <section className="relative isolate overflow-hidden bg-[#FFF8F1]">
        <div aria-hidden="true" className="absolute -right-32 -top-40 size-[34rem] rounded-full bg-orange-200/40 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-48 -left-40 size-[30rem] rounded-full bg-white/90 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:px-10 lg:py-20">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-4 py-2 text-sm font-bold text-neutral-800 shadow-sm">
              <span aria-hidden="true" className="size-2 rounded-full bg-[#FF7A00]" />{badge}
            </span>
            <h1 className="mt-6 text-[2.65rem] font-black leading-[1.02] tracking-[-.055em] sm:text-5xl lg:text-[4.2rem]">{titre}</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8">{accroche}</p>
            <p className="mt-3 text-sm font-medium text-neutral-500">{t('informationsPour', { drapeau: PAYS[pays].drapeau, pays: tPays(pays) })}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {bouton()}
              {estLivreur && (
                <a href={`mailto:${EMAIL_CONTACT}?subject=${encodeURIComponent('Question sur le dossier livreur ZupEat')}`} className="inline-flex min-h-12 items-center justify-center rounded-full px-5 text-sm font-semibold text-neutral-700 underline decoration-neutral-300 underline-offset-4 transition hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">{t('contacterSupport')}</a>
              )}
            </div>
          </div>
          <div className="relative mx-auto flex aspect-[1.05] w-full max-w-[32rem] items-center justify-center">
            <div aria-hidden="true" className={`absolute inset-7 rounded-[2.5rem] ${theme.teinte}`} />
            <div aria-hidden="true" className="absolute right-3 top-2 size-24 rounded-full bg-white/80 blur-sm sm:right-8 sm:top-5 sm:size-32" />
            <div className="relative grid size-52 place-items-center rounded-full border border-white bg-white/90 shadow-[0_24px_60px_rgba(0,0,0,.10)] sm:size-64">
              <span className={`grid size-36 place-items-center rounded-[2rem] shadow-lg sm:size-44 ${theme.logo}`}>
                <IconeHero size={76} strokeWidth={1.8} aria-hidden="true" />
              </span>
            </div>
            <div aria-hidden="true" className="absolute bottom-4 left-0 grid size-14 place-items-center rounded-2xl border border-neutral-100 bg-white text-[#B94F00] shadow-lg sm:bottom-8 sm:left-5">
              <Clock3 size={25} />
            </div>
            <div aria-hidden="true" className="absolute right-0 top-1/3 grid size-14 place-items-center rounded-2xl border border-neutral-100 bg-white text-[#B94F00] shadow-lg sm:right-4">
              <Package size={25} />
            </div>
          </div>
        </div>
      </section>


      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-14 md:grid-cols-3 md:px-6">
        {avantages.map((a, index) => {
          const Icone = ICONES_AVANTAGE[a.icone] ?? [Package, Clock3, Bike][index % 3];
          return (
            <article key={a.titre} className="group rounded-[1.75rem] border border-neutral-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-orange-200 hover:shadow-[0_18px_45px_rgba(0,0,0,.07)] sm:p-8">
              <span className={`mb-5 flex size-12 items-center justify-center rounded-2xl ${theme.teinte}`} aria-hidden="true">
                <Icone size={23} strokeWidth={2.1} />
              </span>
              <h2 className="mb-2 text-xl font-extrabold tracking-tight">{a.titre}</h2>
              <p className="leading-6 text-neutral-600">{a.texte}</p>
            </article>
          );
        })}
      </section>

      <section className="bg-[#F7F7F5] px-4 py-16 md:px-6 md:py-20">
        <h2 className="mb-10 text-center text-3xl font-extrabold tracking-tight md:text-4xl">{t('comment')}</h2>
        <ol className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-4">
          {etapes.map((e, i) => (
            <li key={e.titre} className="rounded-3xl bg-white p-6 ring-1 ring-gray-200">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold ${theme.logo}`}>
                {i + 1}
              </span>
              <h3 className="mb-2 mt-4 font-bold">{e.titre}</h3>
              <p className="text-sm text-gray-600">{e.texte}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 md:px-6 md:py-20">
        <h2 className="mb-6 text-3xl font-extrabold tracking-tight">{t('ilVousFaut', { pays: tPays(pays) })}</h2>
        <ul className="space-y-3">
          {prerequis.map((p) => (
            <li key={p} className="flex gap-3">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${theme.teinte}`}>
                ✓
              </span>
              <span className="text-gray-700">{p}</span>
            </li>
          ))}
        </ul>

        <h2 className="mb-6 mt-14 text-3xl font-extrabold tracking-tight">{t('questions')}</h2>
        <div className="space-y-3">
          {questions.map((q) => (
            <details key={q.question} className="group rounded-2xl p-5 ring-1 ring-gray-200 open:bg-gray-50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold">
                {q.question}
                <span className="text-xl text-gray-400 transition-transform group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="mt-3 text-gray-600">{q.reponse}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-16 md:px-6">
        <section className={`rounded-3xl px-6 py-14 text-center ${theme.teinte}`}>
          <h2 className="mb-6 text-3xl font-extrabold tracking-tight text-gray-900">{t('pret')}</h2>
          {bouton()}
          {conditions && (
            <p className="mt-6 text-sm text-gray-600">
              {t('enContinuant')}{' '}
              <Link href={conditions.href} className="text-gray-900 underline hover:text-gray-700">
                {conditions.libelle}
              </Link>
              .
            </p>
          )}
        </section>
      </div>
      </main>
    </div>
  );
}
