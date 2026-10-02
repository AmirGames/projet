import Link from '@/components/LienRegional';
import { LienConnexion } from '@/components/LienConnexion';
import { PAYS, type Pays } from '@/lib/pays-infos';
import { MARQUES, marqueDuNom } from '@/lib/marques';
import { EnTeteMarque } from '@/components/EnTeteMarque';
import { BandeauMarque } from '@/components/BandeauMarque';
import { useTranslations } from 'next-intl';

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
  const bouton = (enBandeau: boolean) => (
    <Link
      href={lienCta}
      className={`inline-block rounded-full px-8 py-4 text-center font-bold transition hover:no-underline ${
        enBandeau ? 'bg-white text-gray-900 hover:bg-gray-100' : theme.bouton
      }`}
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
                code === pays ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {PAYS[code].drapeau} <span className="hidden sm:inline">{tPays(code)}</span>
            </Link>
          ))}
        </nav>
        <LienConnexion />
      </EnTeteMarque>

      <BandeauMarque
        marque={cle}
        badge={badge}
        titre={titre}
        texte={
          <>
            {accroche}
            <span className="mt-3 block text-sm text-white/80">
              {t('informationsPour', { drapeau: PAYS[pays].drapeau, pays: tPays(pays) })}
            </span>
          </>
        }
        emojis={avantages.map((a) => a.icone)}
      >
        {bouton(true)}
      </BandeauMarque>

      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-14 md:grid-cols-3 md:px-6">
        {avantages.map((a) => (
          <div key={a.titre} className="rounded-3xl p-8 ring-1 ring-gray-200">
            <span className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ${theme.teinte}`} aria-hidden="true">
              {a.icone}
            </span>
            <h2 className="mb-2 text-xl font-bold">{a.titre}</h2>
            <p className="text-gray-600">{a.texte}</p>
          </div>
        ))}
      </section>

      <section className="bg-gray-50 px-4 py-16 md:px-6">
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

      <section className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <h2 className="mb-6 text-3xl font-extrabold tracking-tight">{t('ilVousFaut', { pays: tPays(pays) })}</h2>
        <ul className="space-y-3">
          {prerequis.map((p) => (
            <li key={p} className="flex gap-3">
              <span className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${theme.teinte}`}>
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
          {bouton(false)}
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
    </div>
  );
}
