'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Le document à imprimer, et rien d'autre.
 *
 * « Imprimer » depuis l'espace commerçant sortait presque tout le site : la
 * barre latérale, l'en-tête, le menu. Masquer le châssis en CSS ne suffit pas —
 * un élément rendu invisible occupe toujours sa place, et le ticket part avec
 * deux ou trois pages blanches derrière lui.
 *
 * D'où cette page à part, hors de `/merchant` : elle n'a pas de châssis à
 * masquer. Le navigateur n'a sous les yeux que le ticket, et la feuille fait
 * exactement sa hauteur.
 *
 * Deux formats, au même endroit :
 *
 * - `?format=ticket` (défaut) — rouleau 80 mm, police à chasse fixe, pour
 *   l'imprimante thermique du comptoir.
 * - `?format=a4` — feuille A4, pour la facture qu'on remet ou qu'on archive.
 *
 * La boutique se passe en `?storeId=` : cette page vit hors du fournisseur
 * `useCurrentStore`, qui n'existe que dans l'espace commerçant.
 */
function DocumentImprimable() {
  const params = useParams();
  const recherche = useSearchParams();

  const orderId = params?.orderId as string;
  const storeId = recherche.get('storeId') || '';
  const format = recherche.get('format') === 'a4' ? 'a4' : 'ticket';
  // `?auto=0` pour regarder le rendu sans que la boîte d'impression s'ouvre.
  const impressionAutomatique = recherche.get('auto') !== '0';

  const [facture, setFacture] = useState<Facture | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    if (!storeId) {
      setErreur("Aucune boutique indiquée : ajoutez ?storeId=... à l'adresse.");
      setChargement(false);
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/invoices/${storeId}/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || 'Document introuvable pour cette boutique');
        return;
      }

      setFacture(donnees);
    } catch {
      setErreur('Impossible de charger le document');
    } finally {
      setChargement(false);
    }
  }, [storeId, orderId]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  /**
   * L'impression part une fois le document peint, pas dès qu'il est chargé :
   * `window.print()` gèle la page, et un rendu à moitié posé s'imprime à
   * moitié posé.
   */
  useEffect(() => {
    if (!facture || !impressionAutomatique) return;

    const minuterie = setTimeout(() => window.print(), 400);
    return () => clearTimeout(minuterie);
  }, [facture, impressionAutomatique]);

  if (chargement) {
    return <p className="etat">Préparation du document…</p>;
  }

  if (erreur || !facture) {
    return <p className="etat etat-erreur">{erreur || 'Document introuvable'}</p>;
  }

  const ticket = format === 'ticket';

  // Récapitulatif de TVA : on utilise taxDetail quand il existe (multi-taux),
  // sinon on calcule depuis taxRate (rétrocompatibilité).
  const taxLignes: { taux: number; base: number; taxe: number }[] = facture.taxDetail && facture.taxDetail.length > 0
    ? facture.taxDetail
    : facture.tax > 0
      ? [{ taux: Number(facture.taxRate || 0), base: facture.subtotal - facture.tax, taxe: facture.tax }]
      : [];

  const taxTotale = taxLignes.reduce((s, l) => s + l.taxe, 0);

  const emetteur = facture.storeInfo;
  const raisonSociale = emetteur.legalName || emetteur.name;

  return (
    <>
      {/* Barre d'action : jamais sur le papier. */}
      <div className="barre print:hidden">
        <button type="button" onClick={() => window.print()}>
          Imprimer
        </button>
        <a href={`?storeId=${storeId}&format=${ticket ? 'a4' : 'ticket'}&auto=0`}>
          Passer en {ticket ? 'A4' : 'ticket 80 mm'}
        </a>
        <button type="button" onClick={() => window.close()}>
          Fermer
        </button>
      </div>

      {/* `zone-impression` : la règle d'impression du site ne laisse passer
          que ce bloc. Ici il n'y a rien d'autre, mais la classe garde la
          page cohérente avec le reste et sert de garde-fou. */}
      <div className="zone-impression">
        <div className={`feuille ${ticket ? 'feuille-ticket' : 'feuille-a4'}`}>
          <header className="entete">
            <p className="enseigne">{raisonSociale}</p>
            {emetteur.legalName && emetteur.legalName !== emetteur.name && (
              <p>Enseigne : {emetteur.name}</p>
            )}
            {emetteur.address && <p>{emetteur.address}</p>}
            {(emetteur.postalCode || emetteur.city) && (
              <p>{[emetteur.postalCode, emetteur.city].filter(Boolean).join(' ')}</p>
            )}
            {emetteur.phone && <p>{emetteur.phone}</p>}
            {emetteur.email && <p>{emetteur.email}</p>}

            {/* Sans numéro de TVA, le document ne vaut pas justificatif : il ne
                permet ni de récupérer la taxe, ni de passer la dépense. */}
            {emetteur.vatNumber ? (
              <p className="tva-emetteur">N° TVA : {emetteur.vatNumber}</p>
            ) : (
              <p className="avertissement print:hidden">
                Aucun numéro de TVA enregistré — renseignez-le dans votre profil,
                sans quoi ce document n&apos;est pas une facture valable.
              </p>
            )}
            {emetteur.registrationNumber && <p>N° d&apos;entreprise : {emetteur.registrationNumber}</p>}
          </header>

          <hr />

          <section className="repere">
            <p className="titre">{ticket ? 'TICKET' : 'FACTURE'} {facture.invoiceNumber}</p>
            <p>{new Date(facture.invoiceDate).toLocaleString('fr-FR')}</p>
            <p>Commande {orderId.slice(-8).toUpperCase()}</p>
            <p>{facture.deliveryType === 'PICKUP' ? 'À emporter' : 'Livraison'}</p>
            <p>Client : {facture.customerInfo.name}</p>
            {!ticket && facture.customerInfo.email && <p>{facture.customerInfo.email}</p>}
            {!ticket && facture.customerInfo.phone && <p>{facture.customerInfo.phone}</p>}
          </section>

          <hr />

          <table className="lignes">
            <thead>
              <tr>
                <th className="g">Désignation</th>
                <th className="c">Qté</th>
                <th className="d">P.U.</th>
                <th className="d">Total</th>
              </tr>
            </thead>
            <tbody>
              {facture.items.map((ligne, index) => (
                <tr key={`${ligne.description}-${index}`}>
                  <td className="g">
                    {ligne.category && <span className="surtitre">{ligne.category}</span>}
                    {ligne.description}
                    {ligne.variant && <span className="declinaison"> — {ligne.variant}</span>}
                  </td>
                  <td className="c">{ligne.quantity}</td>
                  <td className="d">{euro(ligne.unitPrice)}</td>
                  <td className="d">{euro(ligne.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <hr />

          <table className="totaux">
            <tbody>
              <tr>
                <td>Sous-total articles</td>
                <td className="d">{euro(facture.subtotal)}</td>
              </tr>
              {facture.discount > 0 && (
                <tr>
                  <td>Remise{facture.promoCode ? ` (${facture.promoCode})` : ''}</td>
                  <td className="d">- {euro(facture.discount)}</td>
                </tr>
              )}
              {facture.fees > 0 && (
                <tr>
                  <td>Frais de livraison</td>
                  <td className="d">{euro(facture.fees)}</td>
                </tr>
              )}
              <tr className="total">
                <td>TOTAL {facture.taxIncluded ? 'TTC' : ''}</td>
                <td className="d">{euro(facture.total)}</td>
              </tr>
            </tbody>
          </table>

          {/* Le récapitulatif de TVA. Les prix étant TTC, la taxe s'extrait du
              total : elle ne s'y ajoute pas. Le ticket n'en montrait rien. */}
          {taxLignes.length > 0 ? (
            <>
              <hr />
              <table className="recap-tva">
                <thead>
                  <tr>
                    <th className="g">Taux</th>
                    <th className="d">Base HT</th>
                    <th className="d">TVA</th>
                    <th className="d">TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {taxLignes.map((ligne) => (
                    <tr key={ligne.taux}>
                      <td className="g">{ligne.taux.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %</td>
                      <td className="d">{euro(ligne.base - ligne.taxe)}</td>
                      <td className="d">{euro(ligne.taxe)}</td>
                      <td className="d">{euro(ligne.base)}</td>
                    </tr>
                  ))}
                  {taxLignes.length > 1 && (
                    <tr style={{ fontWeight: 600, borderTop: '1px solid #000' }}>
                      <td className="g">Total TVA</td>
                      <td className="d" />
                      <td className="d">{euro(taxTotale)}</td>
                      <td className="d" />
                    </tr>
                  )}
                </tbody>
              </table>
              {facture.fees > 0 && (
                <p className="note">Frais de livraison non soumis à la taxe.</p>
              )}
            </>
          ) : (
            <p className="note print:hidden">
              Aucune taxe sur cette commande : aucun taux n&apos;était réglé au moment où
              elle a été passée.
            </p>
          )}

          {facture.notes && (
            <>
              <hr />
              <p className="note">{facture.notes}</p>
            </>
          )}

          <hr />

          <footer className="pied">
            <p>
              Paiement :{' '}
              {facture.paymentStatus === 'SUCCEEDED' || facture.paymentStatus === 'PAID'
                ? 'réglé'
                : 'en attente'}
            </p>
            <p>Merci et à bientôt !</p>
          </footer>
        </div>
      </div>

      <style>{`
        @page {
          size: ${ticket ? '80mm auto' : 'A4'};
          margin: ${ticket ? '3mm' : '14mm'};
        }

        body {
          background: #f3f4f6 !important;
          color: #000 !important;
        }

        .barre {
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: center;
          padding: 16px;
          font-family: system-ui, sans-serif;
        }

        .barre button,
        .barre a {
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid #d1d5db;
          background: #fff;
          color: #111;
          font-size: 14px;
          cursor: pointer;
          text-decoration: none;
        }

        .barre button:first-child {
          background: #ea580c;
          border-color: #ea580c;
          color: #fff;
          font-weight: 600;
        }

        .etat {
          padding: 40px;
          text-align: center;
          font-family: system-ui, sans-serif;
          color: #374151;
        }

        .etat-erreur { color: #b91c1c; }

        .feuille {
          background: #fff;
          color: #000;
          margin: 0 auto 40px;
          padding: 10mm 8mm;
          box-shadow: 0 1px 8px rgba(0, 0, 0, 0.15);
        }

        .feuille-ticket {
          width: 80mm;
          font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
          font-size: 11px;
          line-height: 1.45;
        }

        .feuille-a4 {
          width: 210mm;
          max-width: 100%;
          font-family: system-ui, "Helvetica Neue", Arial, sans-serif;
          font-size: 13px;
          line-height: 1.6;
        }

        .feuille p { margin: 0; }

        .entete { text-align: ${ticket ? 'center' : 'left'}; }

        .enseigne {
          font-weight: 700;
          font-size: ${ticket ? '14px' : '20px'};
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .tva-emetteur { margin-top: 6px !important; font-weight: 600; }

        .avertissement {
          margin-top: 6px !important;
          color: #b45309;
          font-size: 10px;
        }

        .repere .titre {
          font-weight: 700;
          font-size: ${ticket ? '12px' : '16px'};
          margin-bottom: 4px !important;
        }

        hr {
          border: 0;
          border-top: 1px dashed #000;
          margin: 8px 0;
        }

        table { width: 100%; border-collapse: collapse; }

        .lignes th,
        .recap-tva th {
          font-weight: 600;
          border-bottom: 1px solid #000;
          padding-bottom: 3px;
        }

        .lignes td,
        .recap-tva td,
        .totaux td {
          padding: 3px 0;
          vertical-align: top;
        }

        .g { text-align: left; }
        .c { text-align: center; }
        .d { text-align: right; white-space: nowrap; }

        .surtitre {
          display: block;
          font-size: ${ticket ? '9px' : '11px'};
          opacity: 0.7;
        }

        .declinaison { opacity: 0.8; }

        .totaux .total td {
          font-weight: 700;
          font-size: ${ticket ? '13px' : '16px'};
          border-top: 1px solid #000;
          padding-top: 5px;
        }

        .note {
          margin-top: 6px;
          font-size: ${ticket ? '10px' : '12px'};
        }

        .pied {
          text-align: center;
          margin-top: 6px;
        }

        @media print {
          body { background: #fff !important; }

          .barre,
          .print\\:hidden { display: none !important; }

          .feuille {
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </>
  );
}

export default function PageImpressionCommande() {
  // `useSearchParams` impose une frontière de suspense au build, comme sur la
  // page de confirmation de commande.
  return (
    <Suspense fallback={<p className="etat">Préparation du document…</p>}>
      <DocumentImprimable />
    </Suspense>
  );
}

interface LigneFacture {
  description: string;
  category?: string | null;
  variant?: string | null;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Facture {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  storeInfo: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    legalName?: string | null;
    vatNumber?: string | null;
    registrationNumber?: string | null;
  };
  customerInfo: { name: string; email: string; phone: string };
  items: LigneFacture[];
  subtotal: number;
  tax: number;
  taxRate: number | null;     // null si multi-taux
  taxDetail?: { taux: number; base: number; taxe: number }[];
  taxIncluded: boolean;
  fees: number;
  discount: number;
  promoCode?: string | null;
  total: number;
  paymentStatus: string;
  orderStatus: string;
  deliveryType: string;
  notes?: string | null;
}
