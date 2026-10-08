'use client';

/**
 * Commander depuis la fiche d'un commerce, sans compte.
 *
 * Cette page était une maquette : un identifiant de boutique écrit en dur, un
 * menu déroulant « Livraison » **sans aucun champ d'adresse**, et une commande
 * envoyée sans adresse, sans frais de zone et sans le détail du panier. Le
 * client qui choisissait la livraison n'avait nulle part où dire où livrer.
 *
 * Elle affiche désormais le même tunnel que la vitrine, sur la boutique dont
 * vient le panier.
 */

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';

import { euro } from '@/lib/format';
import { TunnelCommande, type BoutiqueCommandee } from '@/components/TunnelCommande';
import { EnTeteClient } from '@/components/EnTeteClient';
import { useHydrate } from '@/lib/navigateur';
import { useTranslations } from 'next-intl';
import {
  autresPaniers,
  nombreDArticles,
  totalDuPanier,
  viderPanier,
  type LignePanier,
  type PanierBoutique,
} from '@/lib/paniers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function CheckoutPage() {
  return (
    <Suspense fallback={<ChargementPanier />}>
      <CheckoutAdresse />
    </Suspense>
  );
}

function ChargementPanier() {
  const tc = useTranslations('pageCommande');

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <EnTeteClient />
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-500">{tc('chargement')}</p>
      </div>
    </div>
  );
}

function CheckoutAdresse() {
  const parametres = useSearchParams();
  const demandee = parametres.get('boutique') || '';

  // La navigation fournit la bonne adresse dès le rendu, même avant sa mise
  // à jour dans window.location. Changer de panier réinitialise aussi le
  // formulaire, les frais et la confirmation de la commande précédente.
  return <CheckoutPanier key={demandee} demandee={demandee} />;
}

function CheckoutPanier({ demandee }: { demandee: string }) {
  const t = useTranslations('common');
  const tc = useTranslations('pageCommande');
  const router = useRouter();

  const [boutique, setBoutique] = useState<BoutiqueCommandee | null>(null);
  // Hors des horaires, le tunnel ne propose que le retrait sur un créneau.
  const [ouverteMaintenant, setOuverteMaintenant] = useState<boolean | undefined>(undefined);
  // Les autres paniers en attente : c'est au client de dire lequel il commande.
  const [aChoisir, setAChoisir] = useState<PanierBoutique[]>([]);
  const [lignes, setLignes] = useState<LignePanier[]>([]);
  const [chargement, setChargement] = useState(true);
  const [confirmation, setConfirmation] = useState<{ id: string; numero: string } | null>(null);

  /**
   * De quelle boutique s'agit-il.
   *
   * La fiche du commerce le dit (`?boutique=`). Sans ce paramètre — un lien
   * gardé en favori, un retour en arrière — on se rabat sur le panier en cours
   * s'il n'y en a qu'un, et on demande sinon.
   *
   * Le paramètre vient de la navigation ; seul le stockage attend que le
   * navigateur soit disponible.
   */
  const hydrate = useHydrate();
  const [panierLu, setPanierLu] = useState(false);
  const [boutiqueRetenue, setBoutiqueRetenue] = useState<string | null>(null);

  // Lu une fois par choix de boutique : les paniers n'existent pas au rendu
  // serveur. CheckoutAdresse recrée ce composant si le choix change.
  if (hydrate && !panierLu) {
    setPanierLu(true);
    const paniers = autresPaniers(undefined);

    const retenu = demandee
      ? paniers.find((panier) => panier.storeId === demandee)
      : paniers.length === 1
        ? paniers[0]
        : undefined;

    if (!retenu) {
      // Un identifiant annoncé sans panier : la boutique existe peut-être, mais
      // il n'y a rien à commander.
      setAChoisir(paniers);
    } else {
      setLignes(retenu.lignes);
      setBoutique({ id: retenu.storeId, name: retenu.storeName, slug: retenu.storeSlug });
      setBoutiqueRetenue(retenu.storeId);
    }
    setChargement(false);
  }

  // La route publique donne l'état d'ouverture, l'adresse et le logo de la
  // boutique, et le nom quand celui enregistré manque (panier composé avant
  // cette version).
  useEffect(() => {
    if (!boutiqueRetenue) return;

    fetch(`${API_URL}/api/client/stores/${boutiqueRetenue}`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (typeof donnees?.data?.isOpenNow === 'boolean') {
          setOuverteMaintenant(donnees.data.isOpenNow);
        }
        const lue = donnees?.data;
        if (!lue) return;
        setBoutique((actuelle) => ({
          id: boutiqueRetenue,
          name: actuelle?.name || lue.name || '',
          slug: actuelle?.slug || lue.slug,
          address: lue.address,
          city: lue.city,
          logo: lue.settings?.logo,
        }));
      })
      .catch(() => undefined);
  }, [boutiqueRetenue]);

  if (chargement) {
    return <ChargementPanier />;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <EnTeteClient />
      <div className="px-4 pt-6 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          {/* Sans retour, un client qui veut corriger son panier n'a que le
              bouton du navigateur — et il ne le trouve pas sur téléphone. */}
          <button
            type="button"
            onClick={() => router.back()}
            title={t('back')}
            aria-label={t('back')}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-xs ring-1 ring-gray-200 hover:bg-gray-100 transition"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{tc('titre')}</h1>
            {boutique && <p className="text-sm text-gray-500">{boutique.name}</p>}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {confirmation ? (
          <div className="max-w-md mx-auto bg-white border border-gray-200 rounded-lg text-center p-8 space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-50 border border-green-600 rounded-full flex items-center justify-center">
                <Check size={32} className="text-green-600" />
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-2">{tc('envoyee')}</h2>
              <p className="text-gray-500">
                {tc('aConfirmer')}
              </p>
            </div>

            <div className="bg-gray-100 rounded-lg p-4">
              <p className="text-gray-500 text-sm mb-1">{tc('numero')}</p>
              <p className="text-2xl font-bold text-red-600">#{confirmation.numero}</p>
            </div>

            <Link
              href={`/track?commande=${confirmation.id}`}
              className="block w-full py-3 bg-orange-600 hover:bg-orange-700 rounded-full text-white font-semibold transition-colors"
            >
              {tc('suivre')}
            </Link>
          </div>
        ) : !boutique ? (
          <div className="max-w-md mx-auto bg-white border border-gray-200 rounded-lg p-8 space-y-4">
            {aChoisir.length === 0 ? (
              <>
                <h2 className="text-xl font-bold">{tc('vide')}</h2>
                <p className="text-gray-500 text-sm">
                  {tc('videAide')}
                </p>
                <Link
                  href="/client"
                  className="inline-block py-3 px-6 bg-gray-900 hover:bg-gray-800 rounded-full text-white font-semibold transition-colors"
                >
                  {tc('voirCommerces')}
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold">{tc('quelPanier')}</h2>
                {/* Une commande ne peut porter que sur un commerce : mélanger
                    deux paniers n'aurait ni livreur ni cuisine communs. */}
                <p className="text-gray-500 text-sm">
                  {tc('plusieurs')}
                </p>
                <ul className="space-y-2">
                  {aChoisir.map((panier) => (
                    <li key={panier.storeId}>
                      <Link
                        href={`/checkout?boutique=${panier.storeId}`}
                        className="flex items-center justify-between bg-gray-100 hover:bg-gray-200 rounded-lg px-4 py-3 transition-colors"
                      >
                        <span className="font-semibold">
                          {panier.storeName || tc('commerce')}
                          <span className="block text-xs text-gray-500">
                            {tc('articles', { n: nombreDArticles(panier.lignes) })}
                          </span>
                        </span>
                        <span className="text-red-600">{euro(totalDuPanier(panier.lignes))}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <TunnelCommande
            boutique={boutique}
            lignes={lignes}
            ouverteMaintenant={ouverteMaintenant}
            surCommandePassee={(commande) => {
              setConfirmation({ id: commande.id, numero: commande.numero });
              viderPanier(boutique.id);
              setLignes([]);
            }}
          />
        )}
      </div>
    </div>
  );
}
