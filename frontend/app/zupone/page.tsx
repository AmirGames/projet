import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { accueilDe, lienVersEspace } from '@/lib/domaines';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vitrineZupone');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

/**
 * La vitrine du groupe, servie à la racine de zupone.com (voir ACCUEIL dans
 * lib/domaines.ts).
 *
 * Elle présente les plateformes et renvoie chacun là où il agit : le client
 * vers ZupEat, le commerçant, le livreur et le chauffeur vers la page qui les
 * recrute, sur leur propre domaine. Rien ne s'y passe derrière une connexion.
 */
export default async function VitrineZupOne() {
  const t = await getTranslations('vitrineZupone');

  const plateformes = [
    {
      nom: 'ZupEat',
      etat: t('available'),
      texte: t('eatText'),
      lien: accueilDe('public'),
      action: t('eatAction'),
      disponible: true,
    },
    {
      nom: 'ZupDrive',
      etat: t('comingSoon'),
      texte: t('driveText'),
      lien: accueilDe('drive'),
      action: t('driveAction'),
      disponible: false,
    },
  ];

  const atouts = [
    { titre: t('singleSignupTitle'), texte: t('singleSignupText') },
    { titre: t('localTitle'), texte: t('localText') },
    { titre: t('paymentTitle'), texte: t('paymentText') },
  ];

  const rejoindre = [
    {
      icone: '🏪',
      titre: t('merchantTitle'),
      texte: t('merchantText'),
      lien: lienVersEspace('pro', '/devenir-commercant'),
      action: t('merchantAction'),
    },
    {
      icone: '🛵',
      titre: t('courierTitle'),
      texte: t('courierText'),
      lien: lienVersEspace('livreur', '/devenir-livreur'),
      action: t('courierAction'),
    },
    {
      icone: '🚗',
      titre: t('driverTitle'),
      texte: t('driverText'),
      lien: lienVersEspace('drive', '/devenir-chauffeur'),
      action: t('driverAction'),
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 md:px-10">
        <span className="text-2xl font-black text-primary md:text-3xl">ZupOne</span>
        <nav className="flex items-center gap-6 text-sm font-semibold md:text-base">
          <a href="#plateformes" className="hidden hover:text-primary sm:inline">
            {t('navPlatforms')}
          </a>
          <a href="#rejoindre" className="hidden hover:text-primary sm:inline">
            {t('navJoin')}
          </a>
          <Link href={accueilDe('public')} className="rounded-full bg-accent px-5 py-2 text-white hover:bg-accent-hover">
            {t('navOrder')}
          </Link>
        </nav>
      </header>

      <section className="bg-gradient-to-b from-white to-slate-100 px-6 py-16 text-center md:py-24">
        <span className="mb-6 inline-block rounded-full bg-blue-100 px-4 py-2 font-bold text-primary">
          {t('badge')}
        </span>
        <h1 className="mx-auto mb-5 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
          {t('heroTitle')}
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-slate-500">{t('heroText')}</p>
      </section>

      <section id="plateformes" className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-6 py-16 md:grid-cols-2">
        {plateformes.map((p) => (
          <div key={p.nom} className="flex flex-col rounded-3xl border border-slate-200 p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-3xl font-black text-primary">{p.nom}</h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  p.disponible ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {p.etat}
              </span>
            </div>
            <p className="mb-8 flex-1 text-slate-600">{p.texte}</p>
            <Link
              href={p.lien}
              className="self-start rounded-full bg-primary px-6 py-3 font-bold text-white hover:bg-primary-hover"
            >
              {p.action}
            </Link>
          </div>
        ))}
      </section>

      <section className="bg-slate-50 px-6 py-16 md:px-10">
        <h2 className="mb-10 text-center text-3xl font-black">{t('oneAccountTitle')}</h2>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {atouts.map((point) => (
            <div key={point.titre} className="rounded-3xl border border-slate-200 bg-white p-6">
              <h3 className="mb-2 font-bold">{point.titre}</h3>
              <p className="text-sm text-slate-500">{point.texte}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="rejoindre" className="px-6 py-16 md:px-10">
        <h2 className="mb-10 text-center text-3xl font-black">{t('joinTitle')}</h2>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {rejoindre.map((r) => (
            <div key={r.titre} className="flex flex-col rounded-3xl border border-slate-200 p-8">
              <div className="mb-3 text-4xl">{r.icone}</div>
              <h3 className="mb-2 text-xl font-bold">{r.titre}</h3>
              <p className="mb-6 flex-1 text-slate-500">{r.texte}</p>
              <Link href={r.lien} className="font-bold text-primary hover:underline">
                {r.action} →
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
