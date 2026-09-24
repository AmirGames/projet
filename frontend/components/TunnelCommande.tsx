'use client';

/**
 * Commander en tant qu'invité : coordonnées, mode de livraison, adresse.
 *
 * Ce tunnel n'existait qu'à un seul endroit, la vitrine `/store/[slug]`. La
 * page `/checkout`, celle où mène « Passer la commande » depuis la fiche d'un
 * restaurant, en avait une version appauvrie : un menu déroulant « Livraison »
 * et **aucun champ d'adresse**. Le client choisissait la livraison sans jamais
 * pouvoir dire où livrer, et la commande partait sans adresse, sans frais de
 * zone et sans le détail du panier.
 *
 * Le formulaire vit donc ici, une fois, et les deux pages l'affichent : en
 * fenêtre sur la vitrine, à plat sur la page dédiée.
 */

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

import { euro } from '@/lib/format';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { totalDuPanier, type LignePanier } from '@/lib/paniers';
import { useAuth } from '@/lib/auth-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Les conditions de livraison à l'adresse saisie. */
interface Livraison {
  livrable: boolean;
  zone: { name: string; minOrder: number; deliveryMinutes: number | null } | null;
  distanceKm: number | null;
  frais: number;
  minimum: number;
  raison: string;
  forfaitBoutique: boolean;
}

interface MoyenDePaiement {
  id: string;
  type: string;
  name: string;
  isDefault: boolean;
}

export interface CommandePassee {
  id: string;
  numero: string;
}

interface Props {
  boutique: { id: string; name: string };
  lignes: LignePanier[];
  /** La commande est passée : au parent de vider le panier et de l'annoncer. */
  surCommandePassee: (commande: CommandePassee) => void;
  /** Renoncer. Sans ce rappel, le bouton « Annuler » n'est pas proposé. */
  surAnnulation?: () => void;
  /** En fenêtre par-dessus le menu, ou à plat sur une page à elle. */
  disposition?: 'modale' | 'page';
  /**
   * La boutique est-elle dans ses horaires en ce moment.
   *
   * Fermée, elle prend encore des retraits sur un créneau à venir, mais pas de
   * livraison : celle-ci part tout de suite, et personne ne la préparerait.
   */
  ouverteMaintenant?: boolean;
}

export function TunnelCommande({
  boutique,
  lignes,
  surCommandePassee,
  surAnnulation,
  disposition = 'modale',
  ouverteMaintenant,
}: Props) {
  const livraisonFermee = ouverteMaintenant === false;
  const { user } = useAuth();
  const [livraison, setLivraison] = useState<Livraison | null>(null);
  // Créneaux réellement proposables, déduits des horaires de la boutique.
  const [creneaux, setCreneaux] = useState<
    { date: string; libelle: string; creneaux: { valeur: string; libelle: string }[] }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  /**
   * Les moyens de paiement du commerçant.
   *
   * Ils étaient réglables côté commerçant sans être montrés au client : au
   * moment de payer, aucun choix n'apparaissait.
   */
  const [moyens, setMoyens] = useState<MoyenDePaiement[]>([]);
  const [moyenChoisi, setMoyenChoisi] = useState('');
  // Le code promo : saisi, puis vérifié par le serveur.
  const [code, setCode] = useState('');
  const [remise, setRemise] = useState<{ code: string; montant: number } | null>(null);
  const [codeEnCours, setCodeEnCours] = useState(false);
  const [codeRefuse, setCodeRefuse] = useState('');

  const [checkoutForm, setCheckoutForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    deliveryType: (livraisonFermee ? 'PICKUP' : 'DELIVERY') as 'PICKUP' | 'DELIVERY',
    deliveryAddress: '',
    deliveryCity: '',
    // L'API l'accepte depuis toujours, aucun écran ne le demandait : la
    // commande partait sans code postal, et le livreur devinait.
    deliveryPostal: '',
    // Renseignées quand le client retient une suggestion d'adresse.
    deliveryLat: undefined as number | undefined,
    deliveryLng: undefined as number | undefined,
    pickupTime: '',
    notes: '',
  });

  // L'état d'ouverture peut arriver après le premier affichage : on bascule
  // alors sur le retrait, seul mode possible.
  useEffect(() => {
    if (livraisonFermee) {
      setCheckoutForm((formulaire) =>
        formulaire.deliveryType === 'PICKUP' ? formulaire : { ...formulaire, deliveryType: 'PICKUP' }
      );
    }
  }, [livraisonFermee]);

  // Charger les informations du profil utilisateur si connecté.
  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    let annule = false;

    fetch(`${API_URL}/api/client/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (annule || !donnees?.data) return;

        const profil = donnees.data;
        setCheckoutForm((formulaire) => ({
          ...formulaire,
          customerName: profil.name || formulaire.customerName,
          customerEmail: profil.email || formulaire.customerEmail,
          customerPhone: profil.phone || formulaire.customerPhone,
          deliveryAddress: profil.address || formulaire.deliveryAddress,
          deliveryCity: profil.city || formulaire.deliveryCity,
          deliveryPostal: profil.postalCode || formulaire.deliveryPostal,
        }));
      })
      .catch(() => undefined);

    return () => {
      annule = true;
    };
  }, [user]);

  // Les conditions de livraison se lisent dès que l'adresse est retenue.
  useEffect(() => {
    if (!boutique.id || checkoutForm.deliveryType !== 'DELIVERY') {
      setLivraison(null);
      return;
    }

    const { deliveryLat, deliveryLng, deliveryAddress, deliveryCity, deliveryPostal } = checkoutForm;
    let annule = false;

    const situee = deliveryLat !== undefined && deliveryLng !== undefined;
    // À défaut de suggestion retenue, le serveur situe l'adresse écrite.
    const ecrite = [deliveryAddress, deliveryPostal, deliveryCity].filter(Boolean).join(' ');

    if (!situee && ecrite.trim().length < 3) {
      setLivraison(null);
      return;
    }

    const parametres = situee
      ? `?lat=${deliveryLat}&lng=${deliveryLng}`
      : `?adresse=${encodeURIComponent(ecrite)}`;

    // Sans temporisation, chaque frappe interrogerait le service d'adresses.
    const minuteur = setTimeout(() => {
      fetch(`${API_URL}/api/client/stores/${boutique.id}/zone-livraison${parametres}`)
        .then((reponse) => (reponse.ok ? reponse.json() : null))
        .then((donnees) => {
          if (!annule && donnees) setLivraison(donnees.data || null);
        })
        .catch(() => undefined);
    }, situee ? 0 : 500);

    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [
    boutique.id,
    checkoutForm.deliveryType,
    checkoutForm.deliveryLat,
    checkoutForm.deliveryLng,
    checkoutForm.deliveryAddress,
    checkoutForm.deliveryCity,
    checkoutForm.deliveryPostal,
  ]);

  // Un champ d'heure libre laissait choisir 9 h alors que la boutique ouvre à
  // 11 h : la commande partait et personne n'était là pour la remettre.
  useEffect(() => {
    if (!boutique.id || checkoutForm.deliveryType !== 'PICKUP') return;

    let annule = false;

    fetch(`${API_URL}/api/client/stores/${boutique.id}/pickup-slots`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (!annule && donnees) setCreneaux(donnees.data || []);
      })
      .catch(() => undefined);

    return () => {
      annule = true;
    };
  }, [boutique.id, checkoutForm.deliveryType]);

  useEffect(() => {
    if (!boutique.id) return;

    let annule = false;

    fetch(`${API_URL}/api/client/stores/${boutique.id}/payment-methods`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (annule || !donnees) return;

        const proposes: MoyenDePaiement[] = donnees.data || [];
        setMoyens(proposes);

        // Celui que le commerçant a mis par défaut, sinon le premier.
        const parDefaut = proposes.find((moyen) => moyen.isDefault) || proposes[0];
        if (parDefaut) setMoyenChoisi(parDefaut.id);
      })
      .catch(() => undefined);

    return () => {
      annule = true;
    };
  }, [boutique.id]);

  const sousTotal = totalDuPanier(lignes);

  /**
   * Les frais réellement facturés : ceux de la zone de livraison.
   *
   * La vitrine ajoutait 10 % de « frais de service » qui n'existaient nulle part
   * ailleurs — ni réglables, ni prélevés par le serveur.
   */
  const fraisDeLivraison =
    checkoutForm.deliveryType === 'DELIVERY' && livraison?.livrable ? livraison.frais : 0;
  const montantRemise = remise?.montant ?? 0;
  const total = Math.max(0, sousTotal + fraisDeLivraison - montantRemise);

  /** Le panier atteint-il le minimum de la zone. */
  const sousLeMinimum =
    checkoutForm.deliveryType === 'DELIVERY' &&
    Boolean(livraison?.livrable) &&
    sousTotal < (livraison?.minimum ?? 0);

  /**
   * Vérifier le code promo auprès du serveur.
   *
   * Le composant existant appelait la route sans `storeId`, que celle-ci exige :
   * tout code était donc refusé par un « Paramètre storeId requis ».
   */
  const appliquerLeCode = async () => {
    const saisi = code.trim();
    if (!saisi) return;

    setCodeEnCours(true);
    setCodeRefuse('');

    try {
      const reponse = await fetch(
        `${API_URL}/api/promotions/validate?storeId=${boutique.id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: saisi,
            cartTotal: Number(sousTotal.toFixed(2)),
            productIds: lignes.map((ligne) => ligne.productId),
          }),
        }
      );

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setRemise(null);
        setCodeRefuse(lu?.error || "Ce code promo n'est pas valable");
        return;
      }

      const montant = Number(lu?.discountAmount ?? lu?.data?.discountAmount ?? 0);

      if (!(montant > 0)) {
        setRemise(null);
        setCodeRefuse("Ce code n'accorde aucune remise sur ce panier");
        return;
      }

      setRemise({ code: saisi, montant });
    } catch {
      setCodeRefuse('Vérification impossible pour le moment');
    } finally {
      setCodeEnCours(false);
    }
  };

  const retirerLeCode = () => {
    setRemise(null);
    setCode('');
    setCodeRefuse('');
  };

  const commander = async () => {
    setCheckoutError('');

    if (!checkoutForm.customerName || !checkoutForm.customerEmail || !checkoutForm.customerPhone) {
      setCheckoutError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (
      checkoutForm.deliveryType === 'DELIVERY' &&
      (!checkoutForm.deliveryAddress || !checkoutForm.deliveryCity)
    ) {
      setCheckoutError("Veuillez remplir l'adresse de livraison");
      return;
    }

    if (checkoutForm.deliveryType === 'PICKUP' && !checkoutForm.pickupTime) {
      setCheckoutError('Veuillez sélectionner une heure de retrait');
      return;
    }

    if (lignes.length === 0) {
      setCheckoutError('Votre panier est vide');
      return;
    }

    setSubmitting(true);

    try {
      const orderData = {
        storeId: boutique.id,
        customerName: checkoutForm.customerName,
        customerEmail: checkoutForm.customerEmail,
        customerPhone: checkoutForm.customerPhone,
        deliveryType: checkoutForm.deliveryType,
        deliveryAddress: checkoutForm.deliveryAddress || undefined,
        deliveryCity: checkoutForm.deliveryCity || undefined,
        deliveryPostal: checkoutForm.deliveryPostal || undefined,
        deliveryLat: checkoutForm.deliveryLat,
        deliveryLng: checkoutForm.deliveryLng,
        pickupTime: checkoutForm.pickupTime || undefined,
        notes: checkoutForm.notes || undefined,
        // Le code part tel quel : le serveur recalcule la remise, comme il
        // recalcule les prix et les frais de livraison.
        promoCode: remise?.code || undefined,
        paymentMethodId: moyenChoisi || undefined,
        // L'API attend des euros (Decimal 10,2), pas des centimes.
        totalAmount: Number(total.toFixed(2)),
        taxAmount: 0,
        // Le serveur recalcule ces frais depuis la zone : on envoie ce qu'on a
        // affiché, il tranche.
        feesAmount: Number(fraisDeLivraison.toFixed(2)),
        // Le détail du panier : sans lui la commande n'enregistre qu'un montant,
        // et la facture comme le détail de commande restent vides.
        items: lignes.map((ligne) => ({
          productId: ligne.productId,
          quantity: ligne.quantity,
          price: ligne.price,
          // La cuisine a besoin de savoir laquelle préparer.
          ...(ligne.variantId ? { variantId: ligne.variantId } : {}),
        })),
      };

      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const erreur = await response.json().catch(() => null);
        setCheckoutError(erreur?.error || 'Erreur lors de la création de la commande');
        return;
      }

      const recue = await response.json();
      const id = recue.order?.id || recue.id;

      surCommandePassee({ id, numero: String(id).slice(-8).toUpperCase() });
    } catch (error) {
      console.error('Checkout error:', error);
      setCheckoutError('Erreur de connexion. Veuillez réessayer.');
    } finally {
      setSubmitting(false);
    }
  };

  const enFenetre = disposition === 'modale';
  const champ =
    'w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500';

  return (
    <div>
      <div
        className={
          enFenetre ? 'p-6 space-y-6 max-h-96 overflow-y-auto' : 'space-y-6'
        }
      >
        {checkoutError && (
          <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4 flex gap-3">
            <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{checkoutError}</p>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="font-bold text-lg">Vos Informations</h3>
          <div>
            <label htmlFor="client-nom" className="text-sm text-gray-400 block mb-2">
              Nom complet *
            </label>
            <input
              id="client-nom"
              type="text"
              value={checkoutForm.customerName}
              onChange={(e) => setCheckoutForm({ ...checkoutForm, customerName: e.target.value })}
              className={champ}
              placeholder="Jean Dupont"
            />
          </div>

          <div>
            <label htmlFor="client-email" className="text-sm text-gray-400 block mb-2">
              Email *
            </label>
            <input
              id="client-email"
              type="email"
              value={checkoutForm.customerEmail}
              onChange={(e) => setCheckoutForm({ ...checkoutForm, customerEmail: e.target.value })}
              className={champ}
              placeholder="jean@example.com"
            />
          </div>

          <div>
            <label htmlFor="client-telephone" className="text-sm text-gray-400 block mb-2">
              Téléphone *
            </label>
            <input
              id="client-telephone"
              type="tel"
              value={checkoutForm.customerPhone}
              onChange={(e) => setCheckoutForm({ ...checkoutForm, customerPhone: e.target.value })}
              className={champ}
              placeholder="+33 6 12 34 56 78"
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-lg">Mode de Livraison</h3>
          <div className="space-y-3">
            <label
              className={`flex items-center gap-3 p-3 bg-gray-700 rounded transition-colors ${
                livraisonFermee ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-600'
              }`}
            >
              <input
                type="radio"
                name="deliveryType"
                value="DELIVERY"
                checked={checkoutForm.deliveryType === 'DELIVERY'}
                disabled={livraisonFermee}
                onChange={(e) =>
                  setCheckoutForm({ ...checkoutForm, deliveryType: e.target.value as any })
                }
                className="w-4 h-4"
              />
              <div className="flex-1">
                <p className="font-semibold">Livraison à domicile</p>
                <p className="text-xs text-gray-400">
                  {livraisonFermee
                    ? 'Indisponible : la boutique est fermée pour le moment'
                    : 'Livraison à votre adresse'}
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 bg-gray-700 rounded cursor-pointer hover:bg-gray-600 transition-colors">
              <input
                type="radio"
                name="deliveryType"
                value="PICKUP"
                checked={checkoutForm.deliveryType === 'PICKUP'}
                onChange={(e) =>
                  setCheckoutForm({ ...checkoutForm, deliveryType: e.target.value as any })
                }
                className="w-4 h-4"
              />
              <div className="flex-1">
                <p className="font-semibold">Retrait sur place</p>
                <p className="text-xs text-gray-400">Récupérez votre commande à la boutique</p>
              </div>
            </label>
          </div>
        </div>

        {checkoutForm.deliveryType === 'DELIVERY' && (
          <div className="space-y-4">
            <h3 className="font-bold text-lg">Adresse de Livraison</h3>
            <div>
              <label htmlFor="livraison-adresse" className="text-sm text-gray-400 block mb-2">
                Adresse *
              </label>
              <AddressAutocomplete
                id="livraison-adresse"
                value={checkoutForm.deliveryAddress}
                onChange={(valeur) =>
                  setCheckoutForm({
                    ...checkoutForm,
                    deliveryAddress: valeur,
                    // Taper par-dessus une suggestion retenue rendrait ses
                    // coordonnées fausses.
                    deliveryLat: undefined,
                    deliveryLng: undefined,
                  })
                }
                onSelect={(adresse) =>
                  setCheckoutForm({
                    ...checkoutForm,
                    deliveryAddress: adresse.street,
                    deliveryCity: adresse.city || checkoutForm.deliveryCity,
                    deliveryPostal: adresse.postalCode || checkoutForm.deliveryPostal,
                    // Les coordonnées de l'adresse choisie étaient jetées : sans
                    // elles, le suivi ne peut afficher ni distance restante ni
                    // durée estimée.
                    deliveryLat: adresse.latitude ?? undefined,
                    deliveryLng: adresse.longitude ?? undefined,
                  })
                }
                className={champ}
                placeholder="123 rue de la Paix"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="livraison-ville" className="text-sm text-gray-400 block mb-2">
                  Ville *
                </label>
                <input
                  id="livraison-ville"
                  type="text"
                  value={checkoutForm.deliveryCity}
                  onChange={(e) =>
                    setCheckoutForm({ ...checkoutForm, deliveryCity: e.target.value })
                  }
                  className={champ}
                  placeholder="Paris"
                />
              </div>

              <div>
                <label htmlFor="livraison-code-postal" className="text-sm text-gray-400 block mb-2">
                  Code postal
                </label>
                <input
                  id="livraison-code-postal"
                  type="text"
                  inputMode="numeric"
                  value={checkoutForm.deliveryPostal}
                  onChange={(e) =>
                    setCheckoutForm({ ...checkoutForm, deliveryPostal: e.target.value })
                  }
                  className={champ}
                  placeholder="75002"
                />
              </div>
            </div>

            {/* Les conditions de la zone, dites avant de payer et non après. */}
            {livraison && !livraison.forfaitBoutique && (
              <div
                role="status"
                className={`rounded-lg px-3 py-2 text-sm border ${
                  !livraison.livrable
                    ? 'border-red-700/50 bg-red-900/20 text-red-200'
                    : sousTotal < livraison.minimum
                      ? 'border-amber-700/50 bg-amber-900/20 text-amber-200'
                      : 'border-green-700/50 bg-green-900/20 text-green-200'
                }`}
              >
                {!livraison.livrable ? (
                  <p>{livraison.raison}</p>
                ) : (
                  <>
                    <p className="font-semibold">
                      Zone « {livraison.zone?.name} »
                      {livraison.distanceKm !== null && ` — ${livraison.distanceKm} km`}
                    </p>
                    <p>
                      Livraison {euro(livraison.frais)}
                      {livraison.zone?.deliveryMinutes
                        ? `, environ ${livraison.zone.deliveryMinutes} min`
                        : ''}
                      {livraison.minimum > 0 && ` — minimum ${euro(livraison.minimum)}`}
                    </p>
                    {sousTotal < livraison.minimum && (
                      <p className="mt-1">
                        Il vous manque {euro(livraison.minimum - sousTotal)} pour atteindre le
                        minimum de cette zone.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {checkoutForm.deliveryType === 'PICKUP' && (
          <div className="space-y-4">
            <h3 className="font-bold text-lg">Heure de Retrait</h3>
            <div>
              <label htmlFor="creneau" className="text-sm text-gray-400 block mb-2">
                Sélectionnez une heure *
              </label>

              {creneaux.length === 0 ? (
                <p className="text-sm text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded px-3 py-2">
                  Aucun créneau de retrait disponible pour les prochains jours. Choisissez la
                  livraison, ou revenez plus tard.
                </p>
              ) : (
                <select
                  id="creneau"
                  value={checkoutForm.pickupTime}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, pickupTime: e.target.value })}
                  className={champ}
                >
                  <option value="">Choisir un créneau</option>
                  {creneaux.map((jour) => (
                    <optgroup key={jour.date} label={jour.libelle}>
                      {jour.creneaux.map((creneau) => (
                        <option key={creneau.valeur} value={creneau.valeur}>
                          {creneau.libelle}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* Les moyens de paiement du commerçant. Ils existaient en base sans
            qu'aucun écran ne les montre au client. */}
        {moyens.length > 0 && (
          <div className="space-y-4">
            <h3 className="font-bold text-lg">Moyen de Paiement</h3>
            <div className="space-y-3" role="radiogroup" aria-label="Moyen de paiement">
              {moyens.map((moyen) => (
                <label
                  key={moyen.id}
                  className="flex items-center gap-3 p-3 bg-gray-700 rounded cursor-pointer hover:bg-gray-600 transition-colors"
                >
                  <input
                    type="radio"
                    name="moyenDePaiement"
                    value={moyen.id}
                    checked={moyenChoisi === moyen.id}
                    onChange={() => setMoyenChoisi(moyen.id)}
                    className="w-4 h-4"
                  />
                  <span className="flex-1 font-semibold">{moyen.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Le code promo : il n'y avait aucun champ pour le saisir. */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg">Code Promo</h3>

          {remise ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-green-700/50 bg-green-900/20 px-3 py-2 text-sm text-green-200">
              <span>
                Code « {remise.code} » appliqué — {euro(remise.montant)} de remise
              </span>
              <button
                type="button"
                onClick={retirerLeCode}
                className="text-green-300 underline hover:text-green-100"
              >
                Retirer
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                id="code-promo"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className={champ}
                placeholder="BIENVENUE10"
              />
              <button
                type="button"
                onClick={appliquerLeCode}
                disabled={codeEnCours || code.trim().length === 0}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {codeEnCours ? 'Vérification…' : 'Appliquer'}
              </button>
            </div>
          )}

          {codeRefuse && (
            <p role="status" className="text-sm text-amber-300">
              {codeRefuse}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-lg">Notes (Optionnel)</h3>
          <textarea
            value={checkoutForm.notes}
            onChange={(e) => setCheckoutForm({ ...checkoutForm, notes: e.target.value })}
            className={`${champ} h-20`}
            placeholder="Instructions spéciales, allergies, etc..."
          />
        </div>

        <div className="bg-gray-700 rounded-lg p-4 space-y-2">
          <h3 className="font-bold mb-3">Résumé de la Commande</h3>
          <div className="flex justify-between text-sm">
            <span>Sous-total</span>
            <span>{euro(sousTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>
              Livraison
              {livraison?.zone ? ` — ${livraison.zone.name}` : ''}
            </span>
            <span>
              {checkoutForm.deliveryType === 'PICKUP' ? 'Retrait sur place' : euro(fraisDeLivraison)}
            </span>
          </div>
          {remise && (
            <div className="flex justify-between text-sm text-green-300">
              <span>Remise — {remise.code}</span>
              <span>− {euro(remise.montant)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg border-t border-gray-600 pt-2">
            <span>Total</span>
            <span className="text-red-400">{euro(total)}</span>
          </div>
        </div>
      </div>

      <div
        className={
          enFenetre
            ? 'border-t border-gray-700 p-6 flex gap-3'
            : 'border-t border-gray-700 pt-6 mt-6 flex gap-3'
        }
      >
        {surAnnulation && (
          <button
            onClick={surAnnulation}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded font-semibold transition-colors"
          >
            Annuler
          </button>
        )}
        <button
          onClick={commander}
          // Hors zone ou sous le minimum, le serveur refuserait : autant le dire
          // avant que le client valide.
          disabled={
            submitting ||
            sousLeMinimum ||
            (checkoutForm.deliveryType === 'DELIVERY' && livraison?.livrable === false)
          }
          className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? 'Traitement...'
            : sousLeMinimum
              ? `Minimum ${euro(livraison?.minimum ?? 0)}`
              : checkoutForm.deliveryType === 'DELIVERY' && livraison?.livrable === false
                ? 'Adresse non livrée'
                : 'Confirmer la Commande'}
        </button>
      </div>
    </div>
  );
}
