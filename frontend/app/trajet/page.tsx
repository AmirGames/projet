'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Car, Loader, MapPin, Navigation } from 'lucide-react';

import { AddressAutocomplete, type AdresseChoisie } from '@/components/AddressAutocomplete';
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
 * Le prix affiché vient du serveur (devis) et c'est ce prix, figé, qui est
 * envoyé à la commande : s'il a changé entre-temps, le serveur refuse et la
 * page propose le nouveau devis. Rien n'est calculé ici.
 */

interface Devis {
  region: string;
  distanceMetres: number;
  dureeSecondes: number;
  prixCentimes: number;
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
        corps: { depart, arrivee, cleIdempotence: cle, prixAnnonceCentimes: devis.prixCentimes },
      });
      router.push(`/trajet/${course.id}`);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'PRICE_CHANGED') {
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
        <h1 className="text-2xl font-bold text-slate-900">{t('titre')}</h1>
        <p className="mt-3 text-slate-600">{t('connexionRequise')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/login" className="rounded-full bg-accent px-5 py-2 text-white hover:bg-accent-hover">
            {t('seConnecter')}
          </Link>
          <Link href="/signup" className="rounded-full border border-slate-300 px-5 py-2 text-slate-800 hover:border-slate-400">
            {t('creerCompte')}
          </Link>
        </div>
      </main>
    );
  }

  const enCours = trajets.find((trajet) => STATUTS_ACTIFS.includes(trajet.statut));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-900">
        <Car /> {t('titre')}
      </h1>
      <p className="mt-2 text-slate-600">{t('intro')}</p>

      {enCours && (
        <Link
          href={`/trajet/${enCours.id}`}
          className="mt-6 block rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800 hover:bg-blue-100"
        >
          {t('trajetEnCours', { destination: enCours.arriveeAdresse })}
        </Link>
      )}

      <section className="mt-8 space-y-4 rounded-xl border border-slate-200 bg-white p-6">
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
            className="mt-1"
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
            className="mt-1"
          />
        </label>

        {envoi === 'devis' && <p className="text-sm text-slate-500">{t('calcul')}</p>}
        {erreur && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {erreur}
          </p>
        )}

        {devis && (
          <div className="rounded-lg bg-slate-50 p-4" data-devis>
            <p className="text-3xl font-bold text-slate-900">{prix(devis.prixCentimes)}</p>
            <p className="mt-1 text-sm text-slate-600">
              {t('estimation', { distance: kilometres(devis.distanceMetres), duree: minutes(devis.dureeSecondes) })}
            </p>
            <p className="mt-1 text-xs text-slate-500">{t('prixFixe')}</p>
            <button
              type="button"
              onClick={commander}
              disabled={envoi !== null || !!enCours}
              className="mt-4 w-full rounded-full bg-accent px-5 py-3 font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {envoi === 'commande' ? t('commandeEnCours') : t('commander', { prix: prix(devis.prixCentimes) })}
            </button>
          </div>
        )}
      </section>

      {trajets.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">{t('mesTrajets')}</h2>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {trajets.map((trajet) => (
              <li key={trajet.id}>
                <Link href={`/trajet/${trajet.id}`} className="flex justify-between gap-4 px-4 py-3 hover:bg-slate-50">
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
