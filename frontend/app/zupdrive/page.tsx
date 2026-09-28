import type { Metadata } from 'next';
import Link from 'next/link';
import { accueilDe } from '@/lib/domaines';
import { EMAIL_CONTACT, PAGES_LEGALES } from '@/lib/editeur';

export const metadata: Metadata = {
  title: 'ZupDrive — Transport avec chauffeur, bientôt disponible',
  description:
    'ZupDrive prépare son service de transport de personnes avec chauffeur (VTC). Chauffeurs, faites-vous connaître dès maintenant.',
};

/**
 * L'accueil de zupdrive.com (voir ACCUEIL dans lib/domaines.ts).
 *
 * Le service VTC n'est pas encore ouvert : la page l'annonce, recrute les
 * chauffeurs et renvoie les clients vers ZupEat en attendant. Elle ne promet
 * ni date ni ville.
 */
export default function AccueilZupDrive() {
  const prevenir = `mailto:${EMAIL_CONTACT}?subject=${encodeURIComponent('Prévenez-moi de l’ouverture de ZupDrive')}`;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 md:px-10">
        <span className="text-2xl font-black text-primary md:text-3xl">ZupDrive</span>
        <nav className="flex items-center gap-6 text-sm font-semibold md:text-base">
          <Link href={accueilDe('public')} className="hidden hover:text-primary sm:inline">
            Commander sur ZupEat
          </Link>
          <Link href="/devenir-chauffeur" className="rounded-full bg-accent px-5 py-2 text-white hover:bg-accent-hover">
            Devenir chauffeur
          </Link>
        </nav>
      </header>

      <section className="bg-gradient-to-b from-white to-slate-100 px-6 py-16 text-center md:py-24">
        <span className="mb-6 inline-block rounded-full bg-amber-100 px-4 py-2 font-bold text-amber-700">
          Bientôt disponible
        </span>
        <h1 className="mx-auto mb-5 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
          Vos trajets avec chauffeur, près de chez vous
        </h1>
        <p className="mx-auto mb-9 max-w-2xl text-lg text-slate-500">
          ZupDrive prépare son service de transport de personnes (VTC). Vous réserverez votre
          chauffeur depuis le même compte que vos commandes ZupEat.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/devenir-chauffeur"
            className="rounded-full bg-accent px-8 py-4 font-bold text-white hover:bg-accent-hover"
          >
            Je suis chauffeur
          </Link>
          <a
            href={prevenir}
            className="rounded-full border-2 border-slate-300 px-8 py-4 font-bold text-slate-900 hover:border-slate-900"
          >
            Être prévenu de l&apos;ouverture
          </a>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 px-6 py-16 md:grid-cols-3 md:px-10">
        {[
          {
            icone: '💶',
            titre: 'Prix connu à l’avance',
            texte: 'Le montant de la course est affiché avant la réservation.',
          },
          {
            icone: '🪪',
            titre: 'Chauffeurs professionnels',
            texte: 'Carte VTC ou autorisation régionale, permis et assurance : chaque dossier est vérifié.',
          },
          {
            icone: '🔑',
            titre: 'Un seul compte',
            texte: 'Votre compte ZupOne sert pour vos trajets comme pour vos commandes.',
          },
        ].map((a) => (
          <div key={a.titre} className="rounded-3xl border border-slate-200 p-8">
            <div className="mb-3 text-4xl">{a.icone}</div>
            <h2 className="mb-2 text-xl font-bold">{a.titre}</h2>
            <p className="text-slate-500">{a.texte}</p>
          </div>
        ))}
      </section>

      <section className="bg-blue-50 px-6 py-16 text-center">
        <h2 className="mb-4 text-3xl font-black">En attendant, ZupEat est ouvert</h2>
        <p className="mx-auto mb-8 max-w-xl text-slate-600">
          Commandez chez les restaurants et commerces de votre quartier, livrés ou à emporter.
        </p>
        <Link
          href={accueilDe('public')}
          className="inline-block rounded-full bg-primary px-8 py-4 font-bold text-white hover:bg-primary-hover"
        >
          Découvrir ZupEat
        </Link>
      </section>

      <footer className="bg-slate-900 px-6 py-12 text-white md:px-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 md:flex-row md:justify-between">
          <div>
            <h4 className="mb-3 text-lg font-bold">ZupDrive</h4>
            <p className="mb-3 text-slate-300">Une plateforme du groupe ZupOne.</p>
            <Link href={accueilDe('vitrine')} className="mb-2 block text-slate-300 hover:text-white">
              Le groupe ZupOne
            </Link>
            <a href={`mailto:${EMAIL_CONTACT}`} className="text-slate-300 hover:text-white">
              {EMAIL_CONTACT}
            </a>
          </div>
          <div>
            <h4 className="mb-3 text-lg font-bold">Informations légales</h4>
            {PAGES_LEGALES.map((page) => (
              <Link key={page.href} href={page.href} className="mb-2 block text-slate-300 hover:text-white">
                {page.titre}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
