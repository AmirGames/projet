'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Point {
  latitude: number;
  longitude: number;
}

/** Le dossier tel que le rend GET /api/superowner/delivery-incidents/:id/dossier. */
interface Dossier {
  genereLe: string;
  incident: { id: string; type: string; ouvertLe: string };
  commande: { id: string; numero: string; statut: string; motifAnnulation: string | null; passeeLe: string; montantTotal: number; fraisLivraison: number; pourboire: number };
  commerce: { name: string; address: string | null; city: string | null; phone: string | null } | null;
  client: { nom: string; adresse: string };
  livreurs: {
    id: string;
    name: string;
    phone: string;
    email: string;
    vehicleType: string;
    vehiclePlate: string | null;
    status: string;
    statusReason: string | null;
    totalDeliveries: number;
    createdAt: string;
    concerne: boolean;
  }[];
  course: {
    id: string;
    statut: string;
    attribueeLe: string | null;
    recupereeLe: string | null;
    remiseLe: string | null;
    annulation: { par: string; motif: string | null } | null;
    distanceKm: number | null;
    remunerationPrevue: number | null;
  };
  preuves: {
    type: string | null;
    codeAttendu: boolean;
    essaisDeCodeRates: number;
    photo: string | null;
    noteDuLivreur: string | null;
    prouveeLe: string | null;
    positionDeLaPhoto: (Point & { precisionM: number | null; releveeLe: string | null; distanceAdresseKm: number | null }) | null;
    attenteClient: { commenceeLe: string; quitteeLe: string | null } | null;
    derniereGpsConnue: (Point & { le: string | null; distanceAdresseKm: number | null }) | null;
    adresseLivraison: Point | null;
    commerce: Point | null;
  };
  constats: {
    type: string;
    phase: string;
    livreurId: string;
    detail: string;
    minutes: number | null;
    distanceKm: number | null;
    alertes: number;
    constateLe: string;
    closLe: string | null;
    closPar: string | null;
    resolution: string | null;
  }[];
  echangesSupport: { le: string; de: string; message: string; surCetteCourse: boolean }[];
  decisions: { le: string; action: string; par: string; details: unknown }[];
  exports: { le: string; par: string }[];
  consequences: {
    paiementLivreur: { etat: string; motif?: string | null; valideLe?: string | null };
    paiementClient: { statut: string; paiements: { status: string; amount: number; paidAt: string | null; refundedAt: string | null; refundedAmount: number | null }[] };
    commerce: { surUnReleve: boolean };
  };
  chronologie: { le: string; quoi: string; detail?: string | null; source: string }[];
  limites: string[];
}

/** Un lien vers la carte : la police ou l'avocat situent le point d'un clic. */
const carte = (p: Point) => `https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=18/${p.latitude}/${p.longitude}`;

/**
 * Le dossier d'un incident de livraison, à imprimer (ou enregistrer en PDF)
 * pour une plainte, un avocat, ou le livreur qui conteste.
 *
 * Page à part, hors du châssis de l'administration, comme les tickets : le
 * navigateur n'imprime que le dossier. L'accès est contrôlé par l'API
 * (section incidents-export), et chaque ouverture est journalisée.
 */
export default function DossierIncidentPage() {
  const t = useTranslations('dossierIncident');
  const tType = useTranslations('superownerDeliveryIncidents');
  const locale = useLocale();
  const incidentId = (useParams()?.incidentId as string) || '';
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/superowner/delivery-incidents/${incidentId}/dossier`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const donnees = await reponse.json().catch(() => null);
      if (!reponse.ok) throw new Error(donnees?.error || t('loadError'));
      setDossier(donnees.data);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : t('loadError'));
    }
  }, [incidentId, t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const date = (valeur: string | null | undefined) =>
    valeur
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Brussels' }).format(new Date(valeur))
      : '—';
  const euros = (n: number | null | undefined) =>
    n == null ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(n);
  const typeIncident = (type: string) => (tType.has(`type.${type}`) ? tType(`type.${type}`) : type);

  const telecharger = () => {
    if (!dossier) return;
    const fichier = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(fichier);
    lien.download = `dossier-incident-${dossier.commande.numero}.json`;
    lien.click();
    URL.revokeObjectURL(lien.href);
  };

  if (erreur) return <p className="p-8 text-red-700 bg-white min-h-screen">{erreur}</p>;
  if (!dossier) return <p className="p-8 text-gray-600 bg-white min-h-screen">{t('loading')}</p>;

  const p = dossier.preuves;
  const titre = 'mt-6 mb-2 text-base font-bold border-b border-gray-300 pb-1';
  const ligne = 'grid grid-cols-[minmax(0,14rem)_1fr] gap-x-4 gap-y-1 text-sm';

  return (
    <main className="min-h-screen bg-white text-gray-900">
      {/* `zone-impression` : la règle d'impression du site (globals.css) masque
          tout le reste de la page. */}
      <div className="zone-impression mx-auto max-w-3xl px-4 py-6 sm:px-8 print:px-0 print:py-0">
        <div className="mb-4 flex flex-wrap gap-2 print:hidden">
          <button onClick={() => window.print()} className="rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
            {t('print')}
          </button>
          <button onClick={telecharger} className="rounded border border-gray-400 px-4 py-2 text-sm">
            {t('downloadJson')}
          </button>
        </div>

        <header className="border-b-2 border-gray-900 pb-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">ZupEat — {t('confidential')}</p>
          <h1 className="text-2xl font-bold">{t('title', { numero: dossier.commande.numero })}</h1>
          <p className="text-sm text-gray-600">
            {t('generated', { date: date(dossier.genereLe) })} · {t('incident')} {typeIncident(dossier.incident.type)} (
            {date(dossier.incident.ouvertLe)}) · {dossier.incident.id}
          </p>
        </header>

        <h2 className={titre}>{t('parties')}</h2>
        {dossier.livreurs.map((l) => (
          <div key={l.id} className={`${ligne} mb-2`}>
            <span className="font-semibold">{l.concerne ? t('driverConcerned') : t('otherDriver')}</span>
            <span>
              {l.name} · {l.phone} · {l.email}
              <br />
              {l.vehicleType}
              {l.vehiclePlate ? ` (${l.vehiclePlate})` : ''} · {t('driverStatus', { status: l.status })}
              {l.statusReason ? ` — ${l.statusReason}` : ''} · {t('since', { date: date(l.createdAt) })} ·{' '}
              {t('deliveries', { count: l.totalDeliveries })}
              <br />
              <span className="text-xs text-gray-500">{l.id}</span>
            </span>
          </div>
        ))}
        <div className={ligne}>
          <span className="font-semibold">{t('store')}</span>
          <span>{[dossier.commerce?.name, dossier.commerce?.address, dossier.commerce?.city, dossier.commerce?.phone].filter(Boolean).join(' · ')}</span>
          <span className="font-semibold">{t('customer')}</span>
          <span>
            {dossier.client.nom} · {dossier.client.adresse}
          </span>
        </div>

        <h2 className={titre}>{t('order')}</h2>
        <div className={ligne}>
          <span>{t('orderStatus')}</span>
          <span>
            {dossier.commande.statut}
            {dossier.commande.motifAnnulation ? ` (${dossier.commande.motifAnnulation})` : ''}
          </span>
          <span>{t('placedAt')}</span>
          <span>{date(dossier.commande.passeeLe)}</span>
          <span>{t('amounts')}</span>
          <span>
            {euros(dossier.commande.montantTotal)} ({t('fees')} {euros(dossier.commande.fraisLivraison)}, {t('tip')}{' '}
            {euros(dossier.commande.pourboire)})
          </span>
          <span>{t('delivery')}</span>
          <span>
            {dossier.course.statut} · {t('assigned')} {date(dossier.course.attribueeLe)} · {t('pickedUp')}{' '}
            {date(dossier.course.recupereeLe)} · {t('delivered')} {date(dossier.course.remiseLe)}
          </span>
          {dossier.course.annulation && (
            <>
              <span>{t('cancellation')}</span>
              <span>
                {dossier.course.annulation.par} — {dossier.course.annulation.motif}
              </span>
            </>
          )}
          <span>{t('plannedPay')}</span>
          <span>
            {euros(dossier.course.remunerationPrevue)} ({dossier.course.distanceKm ?? '—'} km)
          </span>
        </div>

        <h2 className={titre}>{t('evidence')}</h2>
        <div className={ligne}>
          <span>{t('proofType')}</span>
          <span>
            {p.type ?? '—'} · {p.codeAttendu ? t('codeExpected', { failed: p.essaisDeCodeRates }) : t('noCode')} ·{' '}
            {t('provedAt')} {date(p.prouveeLe)}
          </span>
          {p.attenteClient && (
            <>
              <span>{t('wait')}</span>
              <span>
                {t('waitStarted', { date: date(p.attenteClient.commenceeLe) })}
                {p.attenteClient.quitteeLe ? ` · ${t('waitLeft', { date: date(p.attenteClient.quitteeLe) })}` : ''}
              </span>
            </>
          )}
          <span>{t('photoPosition')}</span>
          <span>
            {p.positionDeLaPhoto ? (
              <>
                <a className="underline" href={carte(p.positionDeLaPhoto)}>
                  {p.positionDeLaPhoto.latitude.toFixed(5)}, {p.positionDeLaPhoto.longitude.toFixed(5)}
                </a>{' '}
                · ± {Math.round(p.positionDeLaPhoto.precisionM ?? 0)} m · {date(p.positionDeLaPhoto.releveeLe)} ·{' '}
                {t('fromAddress', { km: p.positionDeLaPhoto.distanceAdresseKm ?? '—' })}
              </>
            ) : (
              t('unknown')
            )}
          </span>
          <span>{t('lastGps')}</span>
          <span>
            {p.derniereGpsConnue ? (
              <>
                <a className="underline" href={carte(p.derniereGpsConnue)}>
                  {p.derniereGpsConnue.latitude.toFixed(5)}, {p.derniereGpsConnue.longitude.toFixed(5)}
                </a>{' '}
                · {date(p.derniereGpsConnue.le)} · {t('fromAddress', { km: p.derniereGpsConnue.distanceAdresseKm ?? '—' })}
              </>
            ) : (
              t('unknown')
            )}
          </span>
          {p.adresseLivraison && (
            <>
              <span>{t('addressPoint')}</span>
              <a className="underline" href={carte(p.adresseLivraison)}>
                {p.adresseLivraison.latitude.toFixed(5)}, {p.adresseLivraison.longitude.toFixed(5)}
              </a>
            </>
          )}
          {p.noteDuLivreur && (
            <>
              <span>{t('driverNote')}</span>
              <span>« {p.noteDuLivreur} »</span>
            </>
          )}
        </div>
        {p.photo && (
          <img src={p.photo} alt={t('photoAlt')} className="mt-3 max-h-96 w-auto max-w-full rounded border border-gray-300" />
        )}

        <h2 className={titre}>{t('findings')}</h2>
        <table className="w-full text-sm">
          <tbody>
            {dossier.constats.map((c, i) => (
              <tr key={i} className="border-b border-gray-200 align-top">
                <td className="py-1 pr-3 whitespace-nowrap">{date(c.constateLe)}</td>
                <td className="py-1">
                  <strong>{typeIncident(c.type)}</strong> — {c.detail}
                  {c.alertes > 1 ? ` (${t('alerts', { count: c.alertes })})` : ''}
                  {c.closLe ? (
                    <span className="block text-gray-600">
                      {t('closed', { date: date(c.closLe), by: c.closPar ?? '—' })} {c.resolution}
                    </span>
                  ) : (
                    <span className="block text-red-700">{t('open')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className={titre}>{t('decisions')}</h2>
        {dossier.decisions.length === 0 ? (
          <p className="text-sm text-gray-600">{t('none')}</p>
        ) : (
          <ul className="text-sm space-y-1">
            {dossier.decisions.map((d, i) => (
              <li key={i}>
                {date(d.le)} — <strong>{d.action}</strong> — {d.par}
                <pre className="mt-0.5 whitespace-pre-wrap break-words text-xs text-gray-600">{JSON.stringify(d.details)}</pre>
              </li>
            ))}
          </ul>
        )}

        <h2 className={titre}>{t('consequences')}</h2>
        <div className={ligne}>
          <span>{t('driverPayment')}</span>
          <span>
            {dossier.consequences.paiementLivreur.etat}
            {dossier.consequences.paiementLivreur.motif ? ` — ${dossier.consequences.paiementLivreur.motif}` : ''}
          </span>
          <span>{t('customerPayment')}</span>
          <span>
            {dossier.consequences.paiementClient.statut}
            {dossier.consequences.paiementClient.paiements.map((pa, i) => (
              <span key={i} className="block">
                {euros(pa.amount)} · {t('paidAt')} {date(pa.paidAt)}
                {pa.refundedAt ? ` · ${t('refunded', { amount: euros(pa.refundedAmount), date: date(pa.refundedAt) })}` : ''}
              </span>
            ))}
          </span>
          <span>{t('storePayment')}</span>
          <span>{dossier.consequences.commerce.surUnReleve ? t('onStatement') : t('notYetOnStatement')}</span>
        </div>

        <h2 className={titre}>{t('support')}</h2>
        {dossier.echangesSupport.length === 0 ? (
          <p className="text-sm text-gray-600">{t('none')}</p>
        ) : (
          <ul className="text-sm space-y-1">
            {dossier.echangesSupport.map((m, i) => (
              <li key={i}>
                {date(m.le)} — <strong>{m.de}</strong> : {m.message}
              </li>
            ))}
          </ul>
        )}

        <h2 className={titre}>{t('timeline')}</h2>
        <table className="w-full text-sm">
          <tbody>
            {dossier.chronologie.map((e, i) => (
              <tr key={i} className="border-b border-gray-200 align-top">
                <td className="py-1 pr-3 whitespace-nowrap">{date(e.le)}</td>
                <td className="py-1">
                  {e.quoi}
                  {e.detail ? <span className="block text-gray-600">{e.detail}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className={titre}>{t('exports')}</h2>
        <ul className="text-sm space-y-1">
          {dossier.exports.map((x, i) => (
            <li key={i}>
              {date(x.le)} — {x.par}
            </li>
          ))}
        </ul>

        <h2 className={titre}>{t('limits')}</h2>
        <ul className="list-disc pl-5 text-sm text-gray-700">
          {dossier.limites.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-gray-500">{t('gdpr')}</p>
      </div>
    </main>
  );
}
