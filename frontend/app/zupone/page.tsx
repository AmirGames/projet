import type { Metadata } from 'next';
import Link from 'next/link';
import { accueilDe, lienVersEspace } from '@/lib/domaines';
import { EMAIL_CONTACT, PAGES_LEGALES } from '@/lib/editeur';

export const metadata: Metadata = {
  title: 'ZupOne — Des services de proximité, un seul compte',
  description:
    'ZupOne réunit ZupEat, pour commander chez les commerces de votre quartier, et ZupDrive, le transport avec chauffeur à venir.',
};

/**
 * La vitrine du groupe, servie à la racine de zupone.com (voir ACCUEIL dans
 * lib/domaines.ts).
 *
 * Elle présente les plateformes et renvoie chacun là où il agit : le client
 * vers ZupEat, le commerçant, le livreur et le chauffeur vers la page qui les
 * recrute, sur leur propre domaine. Rien ne s'y passe derrière une connexion.
 */
export default function VitrineZupOne() {
  const plateformes = [
    {
      nom: 'ZupEat',
      etat: 'Disponible',
      texte:
        'Commandez chez les restaurants et les commerces de votre quartier, livrés par des livreurs proches ou à retirer sur place.',
      lien: accueilDe('public'),
      action: 'Commander sur ZupEat',
      disponible: true,
    },
    {
      nom: 'ZupDrive',
      etat: 'Bientôt disponible',
      texte:
        'Le transport de personnes avec chauffeur (VTC), réservé depuis le même compte que vos commandes.',
      lien: accueilDe('drive'),
      action: 'Découvrir ZupDrive',
      disponible: false,
    },
  ];

  const rejoindre = [
    {
      icone: '🏪',
      titre: 'Commerçant',
      texte: 'Ouvrez votre boutique en ligne et recevez des commandes livrées dans votre quartier.',
      lien: lienVersEspace('pro', '/devenir-commercant'),
      action: 'Devenir commerçant',
    },
    {
      icone: '🛵',
      titre: 'Livreur',
      texte: 'Livrez les commandes des commerces proches, aux heures qui vous conviennent.',
      lien: lienVersEspace('livreur', '/devenir-livreur'),
      action: 'Devenir livreur',
    },
    {
      icone: '🚗',
      titre: 'Chauffeur VTC',
      texte: 'Faites-vous connaître dès maintenant pour conduire avec ZupDrive à son ouverture.',
      lien: lienVersEspace('drive', '/devenir-chauffeur'),
      action: 'Devenir chauffeur',
    },
  ];

  const espaceEquipe = lienVersEspace('groupe', '/superowner');

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 md:px-10">
        <span className="text-2xl font-black text-primary md:text-3xl">ZupOne</span>
        <nav className="flex items-center gap-6 text-sm font-semibold md:text-base">
          <a href="#plateformes" className="hidden hover:text-primary sm:inline">
            Nos plateformes
          </a>
          <a href="#rejoindre" className="hidden hover:text-primary sm:inline">
            Nous rejoindre
          </a>
          <Link href={accueilDe('public')} className="rounded-full bg-accent px-5 py-2 text-white hover:bg-accent-hover">
            Commander
          </Link>
        </nav>
      </header>

      <section className="bg-gradient-to-b from-white to-slate-100 px-6 py-16 text-center md:py-24">
        <span className="mb-6 inline-block rounded-full bg-blue-100 px-4 py-2 font-bold text-primary">
          Le groupe ZupOne
        </span>
        <h1 className="mx-auto mb-5 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
          Des services de proximité, un seul compte
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-slate-500">
          ZupOne réunit des plateformes qui relient les habitants d&apos;un quartier à ceux qui y
          travaillent : commerçants, livreurs et, bientôt, chauffeurs.
        </p>
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
        <h2 className="mb-10 text-center text-3xl font-black">Un compte pour tout</h2>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              titre: 'Une seule inscription',
              texte: 'Le même compte sert sur chaque plateforme du groupe, comme client, commerçant ou livreur.',
            },
            {
              titre: 'Des gens du quartier',
              texte: 'Les commandes vont aux commerces proches et chaque course au livreur disponible le plus près.',
            },
            {
              titre: 'Paiement sécurisé',
              texte: 'Les paiements par carte passent par Stripe : vos coordonnées bancaires ne nous parviennent jamais.',
            },
          ].map((point) => (
            <div key={point.titre} className="rounded-3xl border border-slate-200 bg-white p-6">
              <h3 className="mb-2 font-bold">{point.titre}</h3>
              <p className="text-sm text-slate-500">{point.texte}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="rejoindre" className="px-6 py-16 md:px-10">
        <h2 className="mb-10 text-center text-3xl font-black">Travailler avec nous</h2>
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

      <footer className="bg-slate-900 px-6 py-16 text-white md:px-10">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 md:grid-cols-3">
          <div>
            <h4 className="mb-3 text-lg font-bold">ZupOne</h4>
            <p className="mb-3 text-slate-300">Le groupe derrière ZupEat et ZupDrive.</p>
            <a href={`mailto:${EMAIL_CONTACT}`} className="text-slate-300 hover:text-white">
              {EMAIL_CONTACT}
            </a>
          </div>
          <div>
            <h4 className="mb-3 text-lg font-bold">Plateformes</h4>
            <Link href={accueilDe('public')} className="mb-2 block text-slate-300 hover:text-white">
              ZupEat
            </Link>
            <Link href={accueilDe('drive')} className="mb-2 block text-slate-300 hover:text-white">
              ZupDrive
            </Link>
            <Link href={espaceEquipe} className="mb-2 block text-slate-300 hover:text-white">
              Espace équipe
            </Link>
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
