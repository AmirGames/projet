'use client';

import Link from '@/components/LienRegional';
import { accueilDe, lienVersEspace } from '@/lib/domaines';
import { EMAIL_CONTACT, PAGES_LEGALES } from '@/lib/editeur';

/**
 * Le pied de page commun à tout le site : le groupe ZupOne, ses plateformes
 * et les informations légales. Monté une fois par RootLayoutContent, pour que
 * chaque page l'affiche à l'identique au lieu d'avoir chacune le sien.
 */
export default function PiedDeGroupe() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 px-6 py-16 text-left text-gray-900 md:px-10">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 md:grid-cols-3">
        <div>
          <h4 className="mb-3 text-lg font-bold">ZupOne</h4>
          <p className="mb-3 text-gray-600">Le groupe derrière ZupEat et ZupDrive.</p>
          {/* Le retour au site du groupe, depuis ZupEat comme depuis ZupDrive. */}
          <Link href={accueilDe('vitrine')} className="mb-3 block font-semibold text-gray-900 hover:underline">
            zupone.com →
          </Link>
          <a href={`mailto:${EMAIL_CONTACT}`} className="text-gray-600 hover:text-gray-900">
            {EMAIL_CONTACT}
          </a>
        </div>
        <div>
          <h4 className="mb-3 text-lg font-bold">Plateformes</h4>
          <Link href={accueilDe('public')} className="mb-2 block text-gray-600 hover:text-gray-900">
            ZupEat
          </Link>
          <Link href={accueilDe('drive')} className="mb-2 block text-gray-600 hover:text-gray-900">
            ZupDrive
          </Link>
          <Link href={lienVersEspace('groupe', '/superowner')} className="mb-2 block text-gray-600 hover:text-gray-900">
            Espace équipe
          </Link>
        </div>
        <div>
          <h4 className="mb-3 text-lg font-bold">Informations légales</h4>
          {PAGES_LEGALES.map((page) => (
            <Link key={page.href} href={page.href} className="mb-2 block text-gray-600 hover:text-gray-900">
              {page.titre}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
