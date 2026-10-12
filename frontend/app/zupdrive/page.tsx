import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import Link from '@/components/LienRegional';
import { ArrowRight, BadgeCheck, CarFront, Clock3, MapPin, ShieldCheck } from 'lucide-react';
import { accueilDe } from '@/lib/domaines';
import { EMAIL_CONTACT } from '@/lib/editeur';
import { EnTeteMarque } from '@/components/EnTeteMarque';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titresPages');
  return { title: `ZupDrive — ${t('zupdrive')}`, description: t('zupdriveDescription') };
}

/** La vitrine ZupDrive présente le service en préparation sans promettre de date d'ouverture. */
export default function AccueilZupDrive() {
  const t = useTranslations('accueilZupdrive');
  const prevenir = `mailto:${EMAIL_CONTACT}?subject=${encodeURIComponent(t('sujetPrevenir'))}`;
  const atouts = [
    { icone: Clock3, titre: t('prix'), texte: t('prixTexte') },
    { icone: BadgeCheck, titre: t('pros'), texte: t('prosTexte') },
    { icone: ShieldCheck, titre: t('compte'), texte: t('compteTexte') },
  ];

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <EnTeteMarque marque="zupdrive">
        <Link
          href={accueilDe('public')}
          className="hidden rounded-full px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:inline-flex"
        >
          {t('commanderZupeat')}
        </Link>
        <Link
          href="/devenir-chauffeur"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
        >
          {t('devenirChauffeur')}
        </Link>
      </EnTeteMarque>

      <main>
        <section className="relative isolate overflow-hidden bg-[#F4F7FF]">
          <div aria-hidden="true" className="absolute -right-36 -top-40 size-[34rem] rounded-full bg-blue-200/45 blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-48 -left-40 size-[30rem] rounded-full bg-white/90 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.02fr_.98fr] lg:gap-14 lg:px-10 lg:py-24">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/85 px-4 py-2 text-sm font-bold text-neutral-800 shadow-sm">
                <span aria-hidden="true" className="size-2 rounded-full bg-blue-600" />
                {t('bientot')}
              </span>
              <h1 className="mt-6 text-[2.65rem] font-black leading-[1.02] tracking-[-.055em] sm:text-5xl lg:text-[4.2rem]">
                {t('titre')}
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8">
                {t('texte')}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/devenir-chauffeur"
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-blue-600 px-7 text-base font-bold text-white shadow-[0_8px_24px_rgba(37,99,235,.18)] transition hover:-translate-y-0.5 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                >
                  {t('jeSuisChauffeur')}<ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a
                  href={prevenir}
                  className="inline-flex min-h-14 items-center justify-center rounded-full bg-black px-7 text-base font-bold text-white transition hover:-translate-y-0.5 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                >
                  {t('prevenir')}
                </a>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[37rem] lg:max-w-none">
              <div className="relative aspect-[1.12] overflow-hidden rounded-[2rem] border border-blue-100 bg-gradient-to-br from-white via-[#F9FBFF] to-blue-100/80 shadow-[0_28px_70px_rgba(24,42,82,.12)] sm:rounded-[2.5rem]">
                <div aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(37,99,235,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,.12)_1px,transparent_1px)] [background-size:42px_42px]" />
                <div aria-hidden="true" className="absolute left-[19%] top-[15%] h-[68%] w-[62%] rotate-[-12deg] rounded-[45%] border-[3px] border-dashed border-blue-300/80" />
                <span aria-hidden="true" className="absolute left-[23%] top-[18%] grid size-12 place-items-center rounded-2xl bg-white text-blue-700 shadow-lg sm:size-14">
                  <MapPin size={24} />
                </span>
                <span aria-hidden="true" className="absolute bottom-[19%] right-[20%] grid size-12 place-items-center rounded-2xl bg-white text-blue-700 shadow-lg sm:size-14">
                  <MapPin size={24} />
                </span>
                <div className="absolute left-1/2 top-1/2 grid size-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[2rem] bg-blue-600 text-white shadow-[0_18px_40px_rgba(37,99,235,.28)] sm:size-36">
                  <CarFront size={66} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/80 bg-white/95 p-4 shadow-xl sm:bottom-7 sm:left-7 sm:right-7 sm:p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white" aria-hidden="true">
                      <CarFront size={23} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold tracking-tight">Zup<span className="text-blue-600">Drive</span></p>
                      <p className="mt-0.5 text-xs text-neutral-500">{t('bientot')}</p>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-blue-600" />{t('bientot')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[.14em] text-blue-700">ZupDrive</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">{t('titre')}</h2>
          </div>
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {atouts.map(({ icone: Icone, titre, texte }) => (
              <article key={titre} className="group rounded-[1.75rem] border border-neutral-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_45px_rgba(0,0,0,.07)] sm:p-8">
                <span className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white">
                  <Icone size={23} strokeWidth={2.1} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-extrabold tracking-tight">{titre}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">{texte}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 sm:pb-20 lg:px-10">
          <div className="relative isolate overflow-hidden rounded-[2rem] bg-[#101828] px-6 py-10 text-white sm:px-10 sm:py-14 lg:rounded-[2.5rem] lg:px-14">
            <div aria-hidden="true" className="absolute -right-20 -top-36 size-96 rounded-full bg-blue-600/25 blur-3xl" />
            <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-black tracking-[-.045em] sm:text-4xl">{t('enAttendant')}</h2>
                <p className="mt-4 leading-7 text-white/75">{t('enAttendantTexte')}</p>
              </div>
              <Link
                href={accueilDe('public')}
                className="inline-flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-full bg-[#FF7A00] px-7 font-bold text-black transition hover:-translate-y-0.5 hover:bg-[#E66E00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#101828]"
              >
                {t('decouvrir')}<ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

