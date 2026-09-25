import Link from 'next/link';
import { PAYS, type Pays } from '@/lib/pays';

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
  pays,
  chemin,
}: Props) {
  const bouton = (
    <Link
      href={cta.href}
      className="inline-block rounded-full bg-accent px-8 py-4 font-bold text-white transition hover:bg-accent-hover"
    >
      {cta.libelle}
    </Link>
  );

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 md:px-10">
        <Link href="/" className="text-2xl font-black text-primary md:text-3xl">
          Zupone
        </Link>
        <div className="flex items-center gap-4">
          <nav aria-label="Pays" className="flex gap-1 rounded-full border border-slate-200 p-1 text-sm">
            {(Object.keys(PAYS) as Pays[]).map((code) => (
              <Link
                key={code}
                href={`${chemin}?pays=${code}`}
                aria-current={code === pays ? 'true' : undefined}
                className={`rounded-full px-3 py-1 font-semibold ${
                  code === pays ? 'bg-primary text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {PAYS[code].drapeau} {PAYS[code].nom}
              </Link>
            ))}
          </nav>
          <Link href="/login" className="hidden font-semibold text-slate-900 hover:text-primary sm:inline">
            Connexion
          </Link>
        </div>
      </header>

      <section className="bg-gradient-to-b from-white to-slate-100 px-6 py-16 text-center md:py-24">
        <span className="mb-6 inline-block rounded-full bg-blue-100 px-4 py-2 font-bold text-primary">
          {badge}
        </span>
        <h1 className="mx-auto mb-5 max-w-3xl text-4xl font-black leading-tight md:text-5xl">{titre}</h1>
        <p className="mx-auto mb-3 max-w-2xl text-lg text-slate-500">{accroche}</p>
        <p className="mb-9 text-sm text-slate-500">
          Informations pour : {PAYS[pays].drapeau} {PAYS[pays].nom}
        </p>
        {bouton}
      </section>

      <section className="grid grid-cols-1 gap-6 px-6 py-16 md:grid-cols-3 md:px-10">
        {avantages.map((a) => (
          <div key={a.titre} className="rounded-3xl border border-slate-200 p-8">
            <div className="mb-3 text-4xl">{a.icone}</div>
            <h2 className="mb-2 text-xl font-bold">{a.titre}</h2>
            <p className="text-slate-500">{a.texte}</p>
          </div>
        ))}
      </section>

      <section className="bg-slate-50 px-6 py-16 md:px-10">
        <h2 className="mb-10 text-center text-3xl font-black">Comment ça se passe</h2>
        <ol className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-4">
          {etapes.map((e, i) => (
            <li key={e.titre} className="rounded-3xl border border-slate-200 bg-white p-6">
              <span className="text-2xl font-extrabold text-primary">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="my-2 font-bold">{e.titre}</h3>
              <p className="text-sm text-slate-500">{e.texte}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="mb-6 text-3xl font-black">Ce qu'il vous faut en {PAYS[pays].nom}</h2>
        <ul className="space-y-3">
          {prerequis.map((p) => (
            <li key={p} className="flex gap-3">
              <span className="font-bold text-primary">✓</span>
              <span className="text-slate-700">{p}</span>
            </li>
          ))}
        </ul>

        <h2 className="mb-6 mt-14 text-3xl font-black">Questions fréquentes</h2>
        <div className="space-y-3">
          {questions.map((q) => (
            <details key={q.question} className="rounded-2xl border border-slate-200 p-5">
              <summary className="cursor-pointer font-bold">{q.question}</summary>
              <p className="mt-3 text-slate-600">{q.reponse}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="bg-blue-50 px-6 py-16 text-center">
        <h2 className="mb-6 text-3xl font-black">Prêt à commencer ?</h2>
        {bouton}
        {conditions && (
          <p className="mt-6 text-sm text-slate-500">
            En continuant, vous acceptez les{' '}
            <Link href={conditions.href} className="underline hover:text-slate-900">
              {conditions.libelle}
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}
