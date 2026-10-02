'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Car, Loader, MapPin, Navigation } from 'lucide-react';

import { AddressAutocomplete, type AdresseChoisie } from '@/components/AddressAutocomplete';
import { CarteCourseDrive } from '@/components/CarteCourseDrive';
import { useAuth } from '@/lib/auth-context';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import {
  appelerZupDrive,
  cleAleatoire,
  kilometres,
  minutes,
  prix,
  STATUTS_ACTIFS,
  type AdresseTrajet,
} from '@/lib/zupdrive';

/**
 * ZupDrive — commander un trajet (passager, zupdrive.com/trajet).
 *
 * Le prix affiché vient du serveur, dans un devis signé qui est renvoyé tel
 * quel à la commande : le prix vu est le prix payé. Un devis expiré (10 min)
 * est refusé et la page en redemande un. Rien n'est calculé ici.
 */

interface Devis {
  region: string;
  distanceMetres: number;
  dureeSecondes: number;
  prixCentimes: number;
  /** Le tracé de la route quand le serveur l'a calculé, sinon null. */
  trace: [number, number][] | null;
  /** Le devis signé, à renvoyer pour commander. */
  devis: string;
}

interface Trajet {
  id: string;
  statut: string;
  departAdresse: string;
  arriveeAdresse: string;
  prixCentimes: number;
  createdAt: string;
}

const versTrajet = (a: AdresseChoisie | null): AdresseTrajet | null =>
  a && a.latitude !== null && a.longitude !== null && a.postalCode
    ? { adresse: a.label, latitude: a.latitude, longitude: a.longitude, codePostal: a.postalCode }
    : null;

export default function CommanderTrajetPage() {
  const t = useTranslations('zupdriveTrajet');
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [saisieDepart, setSaisieDepart] = useState('');
  const [saisieArrivee, setSaisieArrivee] = useState('');
  const [depart, setDepart] = useState<AdresseTrajet | null>(null);
  const [arrivee, setArrivee] = useState<AdresseTrajet | null>(null);
  const [devis, setDevis] = useState<Devis | null>(null);
  // Une clé par devis : rejouer la commande de ce devis rend la même course.
  const [cle, setCle] = useState('');
  const [trajets, setTrajets] = useState<Trajet[]>([]);
  const [envoi, setEnvoi] = useState<'devis' | 'commande' | null>(null);
  const [erreur, setErreur] = useState('');

  const chargerTrajets = useCallback(async () => {
    try {
      setTrajets(await appelerZupDrive<Trajet[]>('/api/zupdrive/courses'));
    } catch {
      // La liste est un complément : son absence n'empêche pas de commander.
    }
  }, []);

  useEffectChargement(() => {
    if (user) chargerTrajets();
  }, [user, chargerTrajets]);

  const demanderDevis = async (d = depart, a = arrivee) => {
    setDevis(null);
    setErreur('');
    if (!d || !a) return;
    setEnvoi('devis');
    try {
      setDevis(await appelerZupDrive<Devis>('/api/zupdrive/courses/devis', { method: 'POST', corps: { depart: d, arrivee: a } }));
      setCle(cleAleatoire());
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreur'));
    } finally {
      setEnvoi(null);
    }
  };

  const commander = async () => {
    if (!depart || !arrivee || !devis) return;
    setEnvoi('commande');
    setErreur('');
    try {
      const course = await appelerZupDrive<{ id: string }>('/api/zupdrive/courses', {
        method: 'POST',
        corps: { devis: devis.devis, cleIdempotence: cle },
      });
      router.push(`/trajet/${course.id}`);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'QUOTE_EXPIRED') {
        setErreur(t('prixChange'));
        await demanderDevis();
      } else {
        setErreur(err instanceof Error ? err.message : t('erreur'));
      }
    } finally {
      setEnvoi(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader className="animate-spin" size={32} />
      </div>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">{t('titre')}</h1>
        <p className="mt-3 text-slate-600">{t('connexionRequise')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/login" className="rounded-full bg-blue-600 px-5 py-2 text-white hover:bg-blue-700 hover:no-underline">
            {t('seConnecter')}
          </Link>
          <Link href="/signup" className="rounded-full bg-white px-5 py-2 text-gray-900 ring-1 ring-gray-300 hover:bg-gray-100 hover:no-underline">
            {t('creerCompte')}
          </Link>
        </div>
      </main>
    );
  }

  const enCours = trajets.find((trajet) => STATUTS_ACTIFS.includes(trajet.statut));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
          <Car size={22} />
        </span>
        {t('titre')}
      </h1>
      <p className="mt-2 text-slate-600">{t('intro')}</p>

      {enCours && (
        <Link
          href={`/trajet/${enCours.id}`}
          className="mt-6 block rounded-2xl bg-blue-50 p-4 font-semibold text-blue-800 ring-1 ring-blue-200 hover:bg-blue-100 hover:no-underline"
        >
          {t('trajetEnCours', { destination: enCours.arriveeAdresse })}
        </Link>
      )}

      <section className="mt-8 space-y-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <label className="block text-sm">
          <span className="flex items-center gap-1 font-medium text-slate-700">
            <MapPin size={14} /> {t('depart')}
          </span>
          <AddressAutocomplete
            id="depart"
            value={saisieDepart}
            onChange={(valeur) => {
              setSaisieDepart(valeur);
              setDepart(null);
              setDevis(null);
            }}
            onSelect={(adresse) => {
              const choisi = versTrajet(adresse);
              setDepart(choisi);
              demanderDevis(choisi, arrivee);
            }}
            placeholder={t('departPlaceholder')}
            pays="BE"
            clair
            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </label>
        <label className="block text-sm">
          <span className="flex items-center gap-1 font-medium text-slate-700">
            <Navigation size={14} /> {t('destination')}
          </span>
          <AddressAutocomplete
            id="arrivee"
            value={saisieArrivee}
            onChange={(valeur) => {
              setSaisieArrivee(valeur);
              setArrivee(null);
              setDevis(null);
            }}
            onSelect={(adresse) => {
              const choisie = versTrajet(adresse);
              setArrivee(choisie);
              demanderDevis(depart, choisie);
            }}
            placeholder={t('destinationPlaceholder')}
            pays="BE"
            clair
            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </label>

        {envoi === 'devis' && <p className="text-sm text-slate-500">{t('calcul')}</p>}
        {erreur && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {erreur}
          </p>
        )}

        {devis && depart && arrivee && (
          <CarteCourseDrive depart={depart} arrivee={arrivee} trace={devis.trace} hauteur={220} />
        )}

        {devis && (
          <div className="rounded-2xl bg-gray-50 p-5 ring-1 ring-gray-200" data-devis>
            <p className="text-4xl font-extrabold tracking-tight text-gray-900">{prix(devis.prixCentimes)}</p>
            <p className="mt-1 text-sm text-slate-600">
              {t('estimation', { distance: kilometres(devis.distanceMetres), duree: minutes(devis.dureeSecondes) })}
            </p>
            <p className="mt-1 text-xs text-slate-500">{t('prixFixe')}</p>
            <button
              type="button"
              onClick={commander}
              disabled={envoi !== null || !!enCours}
              className="mt-4 w-full rounded-full bg-blue-600 px-5 py-4 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {envoi === 'commande' ? t('commandeEnCours') : t('commander', { prix: prix(devis.prixCentimes) })}
            </button>
          </div>
        )}
      </section>

      {trajets.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">{t('mesTrajets')}</h2>
          <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-3xl bg-white ring-1 ring-gray-200">
            {trajets.map((trajet) => (
              <li key={trajet.id}>
                <Link href={`/trajet/${trajet.id}`} className="flex justify-between gap-4 px-5 py-4 text-gray-900 hover:bg-gray-50 hover:no-underline">
                  <span className="min-w-0 truncate text-sm text-slate-700">
                    {trajet.departAdresse} → {trajet.arriveeAdresse}
                  </span>
                  <span className="shrink-0 text-sm text-slate-500">
                    {prix(trajet.prixCentimes)} · {t(`statut.${trajet.statut}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
