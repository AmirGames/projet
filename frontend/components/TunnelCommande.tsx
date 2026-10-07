'use client';

import { cleDeTentative, oublierTentative } from '@/lib/cle-tentative';
import { signalerErreur } from '@/lib/erreurs';
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
 * Le formulaire vit donc ici, une fois, et s'affiche sur la page `/checkout`,
 * où mènent la vitrine comme les paniers de l'accueil. Il y prend la forme
 * d'une page de paiement en deux colonnes : les détails de la livraison, le
 * mode et le moyen de paiement à gauche ; la boutique, le panier, le code
 * promo et le total à droite.
 *
 * Il s'ouvrait auparavant en fenêtre par-dessus la vitrine, un long formulaire
 * à faire défiler dans une boîte de quelques centimètres de haut.
 */

import { useEffect, useState } from 'react';
import { telephoneInternational } from '@/lib/pays-infos';
import { paysDuNavigateur } from '@/lib/pays-client';
import {
  AlertCircle,
  Bike,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CreditCard,
  MapPin,
  MessageSquare,
  ShoppingCart,
  Store as IconeBoutique,
  Tag,
  User,
} from 'lucide-react';
import Link from '@/components/LienRegional';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { euro } from '@/lib/format';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { enregistrerAdresseLivraison, useAdresseLivraisonEnregistree } from '@/lib/adresseLivraison';
import { cleDeLigne, nombreDArticles, totalDuPanier, type LignePanier } from '@/lib/paniers';
import { useAuth } from '@/lib/auth-context';
import { StripePayment } from '@/components/stripe-payment';
import { ChoixPourboire } from '@/components/ChoixPourboire';
import { DelaiAnnulation } from '@/components/DelaiAnnulation';
import AcceptationConditions from '@/components/AcceptationConditions';
import { memoriserJetonDeSuivi } from '@/lib/suivi-commande';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Les conditions de livraison à l'adresse saisie. */
interface Livraison {
  livrable: boolean;
  zone: { name: string; minOrder: number; deliveryMinutes: number | null } | null;
  distanceKm: number | null;
  frais: number;
  minimum: number;
  /** Livraison offerte dès ce montant d'articles, si la zone en a un. */
  gratuiteDes?: number | null;
  raison: string;
  forfaitBoutique: boolean;
  /** Qui livre : un livreur de la plateforme, ou le commerçant lui-même. */
  mode?: 'PLATFORM' | 'OWN';
}

/** Sans clé Stripe, rien ne se paie en ligne : pas de pourboire possible. */
const PAIEMENT_EN_LIGNE = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

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

/** Ce que la page sait de la boutique : l'essentiel suffit à commander. */
export interface BoutiqueCommandee {
  id: string;
  name: string;
  slug?: string | null;
  address?: string | null;
  city?: string | null;
  logo?: string | null;
}

interface Props {
  boutique: BoutiqueCommandee;
  lignes: LignePanier[];
  /** La commande est passée : au parent de vider le panier et de l'annoncer. */
  surCommandePassee: (commande: CommandePassee) => void;
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
  ouverteMaintenant,
}: Props) {
  const t = useTranslations('tunnelCommande');
  const livraisonFermee = ouverteMaintenant === false;
  const { user } = useAuth();
  const [livraison, setLivraison] = useState<Livraison | null>(null);
  // Créneaux réellement proposables, déduits des horaires de la boutique.
  const [creneaux, setCreneaux] = useState<
    { date: string; libelle: string; creneaux: { valeur: string; libelle: string }[] }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [conditionsAcceptees, setConditionsAcceptees] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const router = useRouter();
  /**
   * Ce qui partira au commerçant une fois le délai de repentir écoulé.
   *
   * Tant qu'il court, rien n'est transmis : « Retour » ramène à la boutique,
   * le panier intact, pour y ajouter le dessert oublié.
   */
  const [enAttente, setEnAttente] = useState<{ partir: () => void } | null>(null);
  /**
   * La commande attend le paiement en ligne.
   *
   * Elle n'est pas encore partie au commerçant : elle ne lui parvient qu'une
   * fois l'encaissement confirmé. Le panier est gardé jusque-là.
   */
  const [aPayer, setAPayer] = useState<(CommandePassee & { montant: number }) | null>(null);
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

  /**
   * Les blocs repliés derrière leur bouton « Modifier ».
   *
   * Ils s'ouvrent tant qu'il manque quelque chose : un invité voit d'emblée
   * les champs à remplir, un client connecté ne voit que le résumé de ce que
   * son profil a déjà rempli.
   */
  const [contactOuvert, setContactOuvert] = useState(true);
  const [adresseOuverte, setAdresseOuverte] = useState(true);
  const [notesOuvertes, setNotesOuvertes] = useState(false);
  const [panierDeplie, setPanierDeplie] = useState(false);
  const [promoOuverte, setPromoOuverte] = useState(false);

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
  const [fermetureVue, setFermetureVue] = useState(false);
  if (livraisonFermee !== fermetureVue) {
    setFermetureVue(livraisonFermee);
    if (livraisonFermee) {
      setCheckoutForm((formulaire) =>
        formulaire.deliveryType === 'PICKUP' ? formulaire : { ...formulaire, deliveryType: 'PICKUP' }
      );
    }
  }

  // L'adresse retenue sur l'accueil pré-remplit la livraison, une fois lue
  // dans le navigateur.
  const retenue = useAdresseLivraisonEnregistree();
  const [retenueAppliquee, setRetenueAppliquee] = useState(false);
  if (retenue !== undefined && !retenueAppliquee) {
    setRetenueAppliquee(true);
    if (retenue?.street) {
      if (retenue.city) setAdresseOuverte(false);

      setCheckoutForm((formulaire) =>
        formulaire.deliveryAddress
          ? formulaire
          : {
              ...formulaire,
              deliveryAddress: retenue.street,
              deliveryCity: retenue.city,
              deliveryPostal: retenue.postalCode,
              deliveryLat: retenue.latitude ?? undefined,
              deliveryLng: retenue.longitude ?? undefined,
            }
      );
    }
  }

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
        if (profil.name && profil.email && profil.phone) setContactOuvert(false);
        if (profil.address && profil.city) setAdresseOuverte(false);
        setCheckoutForm((formulaire) => ({
          ...formulaire,
          customerName: profil.name || formulaire.customerName,
          customerEmail: profil.email || formulaire.customerEmail,
          customerPhone: profil.phone || formulaire.customerPhone,
          // L'adresse choisie sur l'accueil prime sur celle du profil.
          deliveryAddress: formulaire.deliveryAddress || profil.address || '',
          deliveryCity: formulaire.deliveryAddress ? formulaire.deliveryCity : profil.city || formulaire.deliveryCity,
          deliveryPostal: formulaire.deliveryAddress
            ? formulaire.deliveryPostal
            : profil.postalCode || formulaire.deliveryPostal,
        }));
      })
      .catch(() => undefined);

    return () => {
      annule = true;
    };
  }, [user]);

  // Les conditions de livraison se lisent dès que l'adresse est retenue.
  // Seuls ces champs comptent : le reste du formulaire ne relance rien.
  const { deliveryType, deliveryLat, deliveryLng, deliveryAddress, deliveryCity, deliveryPostal } = checkoutForm;
  const situee = deliveryLat !== undefined && deliveryLng !== undefined;
  // La requête des conditions de livraison, null sans adresse exploitable.
  const requeteLivraison = (() => {
    if (!boutique.id || deliveryType !== 'DELIVERY') return null;
    // À défaut de suggestion retenue, le serveur situe l'adresse écrite.
    const ecrite = [deliveryAddress, deliveryPostal, deliveryCity].filter(Boolean).join(' ');
    if (!situee && ecrite.trim().length < 3) return null;
    const parametres = situee
      ? `?lat=${deliveryLat}&lng=${deliveryLng}`
      : `?adresse=${encodeURIComponent(ecrite)}`;
    return `${boutique.id}/zone-livraison${parametres}`;
  })();

  if (requeteLivraison === null && livraison !== null) setLivraison(null);

  useEffect(() => {
    if (requeteLivraison === null) return;

    let annule = false;

    // Sans temporisation, chaque frappe interrogerait le service d'adresses.
    const minuteur = setTimeout(() => {
      fetch(`${API_URL}/api/client/stores/${requeteLivraison}`)
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
  }, [requeteLivraison, situee]);

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

  // Les frais de service de la plateforme, annoncés avant de valider : le
  // serveur les ajoute de toute façon.
  const [fraisDeService, setFraisDeService] = useState(0);

  useEffect(() => {
    let annule = false;
    fetch(`${API_URL}/api/client/service-fee`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (!annule && donnees?.data) setFraisDeService(Number(donnees.data.frais) || 0);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, []);

  const sousTotal = totalDuPanier(lignes);

  /**
   * Les frais réellement facturés : ceux de la zone de livraison.
   *
   * La vitrine ajoutait 10 % de « frais de service » qui n'existaient nulle part
   * ailleurs — ni réglables, ni prélevés par le serveur.
   */
  // Le seuil de la zone atteint, la livraison est offerte : le serveur
  // l'applique de la même façon.
  const livraisonOfferte =
    livraison?.gratuiteDes != null && sousTotal >= livraison.gratuiteDes;
  const fraisDeLivraison =
    checkoutForm.deliveryType === 'DELIVERY' && livraison?.livrable && !livraisonOfferte
      ? livraison.frais
      : 0;
  /** Ce qu'il manque au panier pour la livraison offerte. */
  const manquePourOfferte =
    livraison?.gratuiteDes != null && !livraisonOfferte ? livraison.gratuiteDes - sousTotal : 0;
  const montantRemise = remise?.montant ?? 0;
  const commandeSeule = Math.max(0, sousTotal + fraisDeLivraison + fraisDeService - montantRemise);

  /**
   * Le pourboire du livreur.
   *
   * Proposé seulement quand il peut lui parvenir : une livraison assurée par
   * un livreur de la plateforme, payée en ligne. Le serveur refuse les autres
   * cas ; il revient en entier au livreur, sur son relevé.
   */
  const [pourboireChoisi, setPourboire] = useState(0);
  const moyenRetenu = moyens.find((m) => m.id === moyenChoisi);
  const pourboirePossible =
    PAIEMENT_EN_LIGNE &&
    checkoutForm.deliveryType === 'DELIVERY' &&
    Boolean(livraison?.livrable) &&
    livraison?.mode === 'PLATFORM' &&
    moyenRetenu?.type !== 'CASH';
  const pourboire = pourboirePossible ? pourboireChoisi : 0;
  const total = Number((commandeSeule + pourboire).toFixed(2));

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
            // Le serveur tarife le panier lui-même : l'aperçu montre la remise
            // que la commande appliquera, pas celle d'un total annoncé.
            lignes: lignes.map((ligne) => ({
              productId: ligne.productId,
              quantity: ligne.quantity,
              ...(ligne.variantId ? { variantId: ligne.variantId } : {}),
              ...(ligne.supplements?.length ? { supplements: ligne.supplements.map((s) => s.id) } : {}),
            })),
          }),
        }
      );

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setRemise(null);
        setCodeRefuse(lu?.error || t('codeInvalide'));
        return;
      }

      const montant = Number(lu?.discountAmount ?? lu?.data?.discountAmount ?? 0);

      if (!(montant > 0)) {
        setRemise(null);
        setCodeRefuse(t('codeSansRemise'));
        return;
      }

      setRemise({ code: saisi, montant });
    } catch {
      setCodeRefuse(t('verificationImpossible'));
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
      setCheckoutError(t('champsObligatoires'));
      setContactOuvert(true);
      return;
    }

    if (
      checkoutForm.deliveryType === 'DELIVERY' &&
      (!checkoutForm.deliveryAddress || !checkoutForm.deliveryCity)
    ) {
      setCheckoutError(t('adresseManquante'));
      setAdresseOuverte(true);
      return;
    }

    if (checkoutForm.deliveryType === 'PICKUP' && !checkoutForm.pickupTime) {
      setCheckoutError(t('heureManquante'));
      return;
    }

    if (lignes.length === 0) {
      setCheckoutError(t('panierVide'));
      return;
    }

    // Payée en espèces, la commande part au commerçant dès sa création : le
    // délai se place avant. Payée en ligne, elle n'attend que l'encaissement :
    // le délai se place au clic sur « Payer ».
    const moyen = moyens.find((m) => m.id === moyenChoisi);
    if (moyen?.type === 'CASH') {
      setEnAttente({ partir: () => void envoyer() });
      return;
    }

    await envoyer();
  };

  const envoyer = async () => {
    setSubmitting(true);

    try {
      const orderData = {
        conditionsAcceptees,
        storeId: boutique.id,
        customerName: checkoutForm.customerName,
        customerEmail: checkoutForm.customerEmail,
        customerPhone: telephoneInternational(checkoutForm.customerPhone, paysDuNavigateur()),
        deliveryType: checkoutForm.deliveryType,
        deliveryAddress: checkoutForm.deliveryAddress || undefined,
        deliveryCity: checkoutForm.deliveryCity || undefined,
        deliveryPostal: checkoutForm.deliveryPostal || undefined,
        deliveryLat: checkoutForm.deliveryLat,
        deliveryLng: checkoutForm.deliveryLng,
        pickupTime: checkoutForm.pickupTime || undefined,
        notes: checkoutForm.notes || undefined,
        // Le code part tel quel : le serveur recalcule la remise, comme il
        // calcule les prix, la taxe, les frais de livraison et le total —
        // aucun montant n'est envoyé.
        promoCode: remise?.code || undefined,
        paymentMethodId: moyenChoisi || undefined,
        ...(pourboire > 0 ? { tipAmount: pourboire } : {}),
        // Le détail du panier : sans lui la commande n'enregistre qu'un montant,
        // et la facture comme le détail de commande restent vides.
        items: lignes.map((ligne) => ({
          productId: ligne.productId,
          quantity: ligne.quantity,
          // La cuisine a besoin de savoir laquelle préparer.
          ...(ligne.variantId ? { variantId: ligne.variantId } : {}),
          // Les suppléments, par identifiant : le serveur les tarife lui-même.
          ...(ligne.supplements?.length ? { supplements: ligne.supplements.map((s) => s.id) } : {}),
        })),
      };

      // Connecté, le jeton range la commande dans son historique : l'adresse
      // saisie seule ne suffit plus à la rattacher à un compte.
      const jeton = user ? localStorage.getItem('accessToken') : null;
      const corps = JSON.stringify(orderData);
      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Renvoyé tel quel, cet achat rend la même commande au lieu d'en créer une seconde.
          'Idempotency-Key': cleDeTentative(corps),
          ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
        },
        body: corps,
      });

      if (!response.ok) {
        const erreur = await response.json().catch(() => null);
        setCheckoutError(erreur?.error || t('erreurCreation'));
        return;
      }

      oublierTentative();
      const recue = await response.json();
      if (checkoutForm.deliveryType === 'DELIVERY' && checkoutForm.deliveryAddress) {
        enregistrerAdresseLivraison({
          label: [checkoutForm.deliveryAddress, checkoutForm.deliveryCity].filter(Boolean).join(', '),
          street: checkoutForm.deliveryAddress,
          city: checkoutForm.deliveryCity,
          postalCode: checkoutForm.deliveryPostal,
          latitude: checkoutForm.deliveryLat ?? null,
          longitude: checkoutForm.deliveryLng ?? null,
        });
      }
      const id = recue.order?.id || recue.id;
      // Rendu une seule fois : sans lui, un client invité ne peut plus suivre
      // sa commande depuis ce navigateur.
      memoriserJetonDeSuivi(id, recue.order?.trackingToken);
      const commande = { id, numero: String(id).slice(-8).toUpperCase() };

      if (recue.order?.paiementEnLigne) {
        // Le pourboire se paie avec la commande.
        setAPayer({
          ...commande,
          montant: Number(recue.order.totalAmount) + Number(recue.order.tipAmount || 0),
        });
        return;
      }

      surCommandePassee(commande);
    } catch (error) {
      signalerErreur('Checkout error:', error);
      setCheckoutError(t('erreurConnexion'));
    } finally {
      setSubmitting(false);
    }
  };

  const champ =
    'w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-red-500';
  const carte = 'bg-white border border-gray-200 rounded-2xl';
  const boutonModifier =
    'shrink-0 rounded-full bg-gray-100 hover:bg-gray-200 px-4 py-2 text-sm font-semibold transition-colors';

  const enLivraison = checkoutForm.deliveryType === 'DELIVERY';
  const articles = nombreDArticles(lignes);
  const adresseBoutique = [boutique.address, boutique.city].filter(Boolean).join(', ');
  const contactComplet = Boolean(
    checkoutForm.customerName && checkoutForm.customerEmail && checkoutForm.customerPhone
  );
  const adresseComplete = Boolean(checkoutForm.deliveryAddress && checkoutForm.deliveryCity);

  const alerte = checkoutError ? (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
      <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
      <p className="text-red-600 text-sm">{checkoutError}</p>
    </div>
  ) : null;

  const libelleDuCreneau = (valeur: string) => {
    for (const jour of creneaux) {
      const trouve = jour.creneaux.find((c) => c.valeur === valeur);
      if (trouve) return `${jour.libelle}, ${trouve.libelle}`;
    }
    return valeur;
  };

  const delai = enAttente ? (
    <DelaiAnnulation
      lieu={enLivraison ? checkoutForm.deliveryAddress || t('livraison') : t('retraitChez', { boutique: boutique.name })}
      precisionLieu={
        enLivraison
          ? [checkoutForm.deliveryPostal, checkoutForm.deliveryCity].filter(Boolean).join(' ')
          : adresseBoutique
      }
      horaire={
        enLivraison
          ? livraison?.zone?.deliveryMinutes
            ? t('livraisonEnviron', { minutes: livraison.zone.deliveryMinutes })
            : t('livraisonDesQuePossible')
          : checkoutForm.pickupTime
            ? t('retraitA', { creneau: libelleDuCreneau(checkoutForm.pickupTime) })
            : t('retrait')
      }
      boutique={boutique.name}
      lignes={lignes}
      surPartir={() => {
        const { partir } = enAttente;
        setEnAttente(null);
        partir();
      }}
      surRetour={() => {
        setEnAttente(null);
        if (boutique.slug) router.push(`/store/${boutique.slug}`);
      }}
    />
  ) : null;

  if (aPayer) {
    return (
      <div className={`${carte} max-w-xl mx-auto p-6 space-y-4`}>
        {delai}
        <h3 className="font-bold text-lg">{t('paiementEnLigne')}</h3>
        <p className="text-sm text-gray-500">
          {t('paiementAide', { numero: aPayer.numero, montant: euro(aPayer.montant), boutique: boutique.name })}
        </p>
        <StripePayment
          orderId={aPayer.id}
          amount={aPayer.montant}
          customerEmail={checkoutForm.customerEmail}
          customerName={checkoutForm.customerName}
          demanderConfirmation={(payer) => setEnAttente({ partir: payer })}
          onPaymentComplete={(reussi) => {
            if (reussi) surCommandePassee({ id: aPayer.id, numero: aPayer.numero });
          }}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
      {delai}
      {/* ——— Colonne de gauche : où, comment, avec quoi ——— */}
      <div className="space-y-6 min-w-0">
        <section className={`${carte} p-6`}>
          <h2 className="text-xl font-bold mb-2">
            {enLivraison ? t('detailsLivraison') : t('detailsRetrait')}
          </h2>

          {/* L'adresse, ou la boutique où passer prendre la commande. */}
          <div className="py-4 border-b border-gray-200">
            {enLivraison ? (
              <>
                <div className="flex items-center gap-4">
                  <MapPin size={22} className="text-gray-700 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">
                      {checkoutForm.deliveryAddress || t('adresseLivraison')}
                    </p>
                    <p className="text-sm text-gray-500 truncate">
                      {adresseComplete
                        ? [checkoutForm.deliveryPostal, checkoutForm.deliveryCity]
                            .filter(Boolean)
                            .join(' ')
                        : t('ouLivrer')}
                    </p>
                  </div>
                  {!adresseOuverte && (
                    <button
                      type="button"
                      onClick={() => setAdresseOuverte(true)}
                      className={boutonModifier}
                    >
                      {t('modifier')}
                    </button>
                  )}
                </div>

                {adresseOuverte && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <label
                        htmlFor="livraison-adresse"
                        className="text-sm text-gray-500 block mb-2"
                      >
                        {t('adresse')} *
                      </label>
                      <AddressAutocomplete
                        clair
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
                            // Les coordonnées de l'adresse choisie étaient jetées :
                            // sans elles, le suivi ne peut afficher ni distance
                            // restante ni durée estimée.
                            deliveryLat: adresse.latitude ?? undefined,
                            deliveryLng: adresse.longitude ?? undefined,
                          })
                        }
                        className={champ}
                        placeholder={t('exempleAdresse')}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="livraison-ville"
                          className="text-sm text-gray-500 block mb-2"
                        >
                          {t('ville')} *
                        </label>
                        <input
                          id="livraison-ville"
                          type="text"
                          value={checkoutForm.deliveryCity}
                          onChange={(e) =>
                            setCheckoutForm({ ...checkoutForm, deliveryCity: e.target.value })
                          }
                          className={champ}
                          placeholder={t('exempleVille')}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="livraison-code-postal"
                          className="text-sm text-gray-500 block mb-2"
                        >
                          {t('codePostal')}
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

                    {adresseComplete && (
                      <button
                        type="button"
                        onClick={() => setAdresseOuverte(false)}
                        className={boutonModifier}
                      >
                        {t('validerAdresse')}
                      </button>
                    )}
                  </div>
                )}

                {/* Les conditions de la zone, dites avant de payer et non après. */}
                {livraison && !livraison.forfaitBoutique && (
                  <div
                    role="status"
                    className={`mt-4 rounded-lg px-3 py-2 text-sm border ${
                      !livraison.livrable
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : sousTotal < livraison.minimum
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-green-200 bg-green-50 text-green-800'
                    }`}
                  >
                    {!livraison.livrable ? (
                      <p>{livraison.raison}</p>
                    ) : (
                      <>
                        <p className="font-semibold">
                          {t('zone', { nom: livraison.zone?.name ?? '' })}
                          {livraison.distanceKm !== null && ` — ${livraison.distanceKm} km`}
                        </p>
                        <p>
                          {livraisonOfferte ? t('livraisonOfferte') : t('livraisonA', { frais: euro(livraison.frais) })}
                          {livraison.zone?.deliveryMinutes
                            ? t('environMinutes', { minutes: livraison.zone.deliveryMinutes })
                            : ''}
                          {livraison.minimum > 0 && t('minimumZone', { minimum: euro(livraison.minimum) })}
                        </p>
                        {manquePourOfferte > 0 && (
                          <p className="mt-1 text-green-700">
                            {t('encorePourOfferte', { montant: euro(manquePourOfferte) })}
                          </p>
                        )}
                        {sousTotal < livraison.minimum && (
                          <p className="mt-1">
                            {t('manquePourMinimum', { montant: euro(livraison.minimum - sousTotal) })}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-4">
                <IconeBoutique size={22} className="text-gray-700 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{t('retraitChez', { boutique: boutique.name })}</p>
                  <p className="text-sm text-gray-500 truncate">
                    {adresseBoutique || t('aLaBoutique')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Les coordonnées du client. */}
          <div className="py-4 border-b border-gray-200">
            <div className="flex items-center gap-4">
              <User size={22} className="text-gray-700 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">
                  {checkoutForm.customerName || t('vosInformations')}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  {contactComplet
                    ? `${checkoutForm.customerEmail} · ${checkoutForm.customerPhone}`
                    : t('vosInformationsAide')}
                </p>
              </div>
              {!contactOuvert && (
                <button
                  type="button"
                  onClick={() => setContactOuvert(true)}
                  className={boutonModifier}
                >
                  {t('modifier')}
                </button>
              )}
            </div>

            {contactOuvert && (
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="client-nom" className="text-sm text-gray-500 block mb-2">
                    {t('nomComplet')} *
                  </label>
                  <input
                    id="client-nom"
                    type="text"
                    value={checkoutForm.customerName}
                    onChange={(e) =>
                      setCheckoutForm({ ...checkoutForm, customerName: e.target.value })
                    }
                    className={champ}
                    placeholder={t('exempleNom')}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="client-email" className="text-sm text-gray-500 block mb-2">
                      {t('email')} *
                    </label>
                    <input
                      id="client-email"
                      type="email"
                      value={checkoutForm.customerEmail}
                      onChange={(e) =>
                        setCheckoutForm({ ...checkoutForm, customerEmail: e.target.value })
                      }
                      className={champ}
                      placeholder={t('exempleEmail')}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="client-telephone"
                      className="text-sm text-gray-500 block mb-2"
                    >
                      {t('telephone')} *
                    </label>
                    <input
                      id="client-telephone"
                      type="tel"
                      value={checkoutForm.customerPhone}
                      onChange={(e) =>
                        setCheckoutForm({ ...checkoutForm, customerPhone: e.target.value })
                      }
                      className={champ}
                      placeholder="+33 6 12 34 56 78"
                    />
                  </div>
                </div>

                {contactComplet && (
                  <button
                    type="button"
                    onClick={() => setContactOuvert(false)}
                    className={boutonModifier}
                  >
                    {t('valider')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Les instructions : sonnette, étage, allergies. */}
          <div className="pt-4">
            <div className="flex items-center gap-4">
              <MessageSquare size={22} className="text-gray-700 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{t('instructions')}</p>
                <p className="text-sm text-gray-500 truncate">
                  {checkoutForm.notes ||
                    (enLivraison
                      ? t('instructionsLivraison')
                      : t('instructionsRetrait'))}
                </p>
              </div>
              {!notesOuvertes && (
                <button
                  type="button"
                  onClick={() => setNotesOuvertes(true)}
                  className={boutonModifier}
                >
                  {checkoutForm.notes ? t('modifier') : t('ajouter')}
                </button>
              )}
            </div>

            {notesOuvertes && (
              <div className="mt-4 space-y-3">
                <textarea
                  aria-label={t('instructions')}
                  value={checkoutForm.notes}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, notes: e.target.value })}
                  className={`${champ} h-20`}
                  placeholder={t('instructionsExemple')}
                />
                <button
                  type="button"
                  onClick={() => setNotesOuvertes(false)}
                  className={boutonModifier}
                >
                  {t('valider')}
                </button>
              </div>
            )}
          </div>

          <h2 className="text-xl font-bold mt-8 mb-4">{t('optionsLivraison')}</h2>
          <div className="space-y-3" role="radiogroup" aria-label={t('modeLivraison')}>
            <label
              className={`flex items-center gap-4 rounded-xl border-2 px-5 py-4 transition-colors ${
                enLivraison ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300'
              } ${
                livraisonFermee
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer hover:border-gray-400'
              }`}
            >
              <input
                type="radio"
                name="deliveryType"
                value="DELIVERY"
                checked={enLivraison}
                disabled={livraisonFermee}
                onChange={() => setCheckoutForm({ ...checkoutForm, deliveryType: 'DELIVERY' })}
                className="sr-only"
              />
              <Bike size={24} className="text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{t('livraison')}</p>
                <p className="text-sm text-gray-500">
                  {livraisonFermee
                    ? t('livraisonFermee')
                    : livraison?.livrable && livraison.zone?.deliveryMinutes
                      ? t('livreChezVousEnviron', { minutes: livraison.zone.deliveryMinutes })
                      : t('livreChezVous')}
                </p>
              </div>
              {livraison?.livrable && (
                <span className="text-sm text-gray-700 whitespace-nowrap">
                  {livraison.frais > 0 && !livraisonOfferte ? `+${euro(livraison.frais)}` : t('offerte')}
                </span>
              )}
            </label>

            <label
              className={`flex items-center gap-4 rounded-xl border-2 px-5 py-4 cursor-pointer transition-colors hover:border-gray-400 ${
                !enLivraison ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="deliveryType"
                value="PICKUP"
                checked={!enLivraison}
                onChange={() => setCheckoutForm({ ...checkoutForm, deliveryType: 'PICKUP' })}
                className="sr-only"
              />
              <CalendarClock size={24} className="text-gray-700 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{t('retraitSurPlace')}</p>
                <p className="text-sm text-gray-500">
                  {t('retraitSurPlaceAide')}
                </p>
              </div>
            </label>
          </div>

          {/* Un champ d'heure libre laissait choisir une heure où la boutique
              est fermée : seuls ses vrais créneaux sont proposés. */}
          {!enLivraison && (
            <div className="mt-4">
              <label htmlFor="creneau" className="text-sm text-gray-500 block mb-2">
                {t('heureRetrait')} *
              </label>

              {creneaux.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {t('aucunCreneau')}
                </p>
              ) : (
                <select
                  id="creneau"
                  value={checkoutForm.pickupTime}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, pickupTime: e.target.value })}
                  className={champ}
                >
                  <option value="">{t('choisirCreneau')}</option>
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
          )}
        </section>

        {/* Les moyens de paiement du commerçant. Ils existaient en base sans
            qu'aucun écran ne les montre au client. */}
        {moyens.length > 0 && (
          <section className={`${carte} p-6`}>
            <h2 className="text-xl font-bold mb-4">{t('moyenPaiement')}</h2>
            <div className="space-y-3" role="radiogroup" aria-label={t('moyenPaiement')}>
              {moyens.map((moyen) => (
                <label
                  key={moyen.id}
                  className={`flex items-center gap-4 rounded-xl border-2 px-5 py-4 cursor-pointer transition-colors hover:border-gray-400 ${
                    moyenChoisi === moyen.id ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="moyenDePaiement"
                    value={moyen.id}
                    checked={moyenChoisi === moyen.id}
                    onChange={() => setMoyenChoisi(moyen.id)}
                    className="sr-only"
                  />
                  <CreditCard size={22} className="text-gray-700 shrink-0" />
                  <span className="flex-1 font-semibold">{moyen.name}</span>
                </label>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ——— Colonne de droite : la boutique, le panier, le total ——— */}
      <aside className={`${carte} overflow-hidden lg:sticky lg:top-6`}>
        {/* La boutique : un clic ramène à son menu pour compléter le panier. */}
        {boutique.slug ? (
          <Link
            href={`/store/${boutique.slug}`}
            className="flex items-center gap-4 p-6 text-gray-900 hover:text-gray-900 hover:bg-gray-50 transition-colors"
          >
            <EnTeteBoutique boutique={boutique} adresse={adresseBoutique} />
            <ChevronRight size={20} className="text-gray-500 shrink-0" />
          </Link>
        ) : (
          <div className="flex items-center gap-4 p-6">
            <EnTeteBoutique boutique={boutique} adresse={adresseBoutique} />
          </div>
        )}

        {/* Le récapitulatif du panier, replié comme un reçu. */}
        <div className="border-t-8 border-white">
          <button
            type="button"
            onClick={() => setPanierDeplie((deplie) => !deplie)}
            aria-expanded={panierDeplie}
            className="w-full flex items-center gap-4 px-6 py-5 hover:bg-gray-50 transition-colors text-left"
          >
            <ShoppingCart size={22} className="text-gray-700 shrink-0" />
            <span className="flex-1 font-semibold">
              {t('recapitulatif', { n: articles })}
            </span>
            <ChevronDown
              size={20}
              className={`text-gray-500 transition-transform ${panierDeplie ? 'rotate-180' : ''}`}
            />
          </button>

          {panierDeplie && (
            <ul className="px-6 pb-5 space-y-3">
              {lignes.map((ligne) => (
                <li
                  key={cleDeLigne(ligne.productId, ligne.variantId, ligne.supplements)}
                  className="flex justify-between gap-4 text-sm"
                >
                  <span className="min-w-0">
                    <span className="text-gray-500">{ligne.quantity} × </span>
                    {ligne.name}
                    {/* Sans le nom de la déclinaison, deux lignes du même plat
                        seraient indistinguables. */}
                    {ligne.variantNom && (
                      <span className="text-gray-500"> — {ligne.variantNom}</span>
                    )}
                    {(ligne.supplements?.length ?? 0) > 0 && (
                      <span className="block text-xs text-gray-500">
                        + {ligne.supplements!.map((sup) => sup.label).join(', ')}
                      </span>
                    )}
                  </span>
                  <span className="whitespace-nowrap">{euro(ligne.price * ligne.quantity)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Le code promo, derrière son lien comme le reste des options. */}
        <div className="border-t-8 border-white px-6 py-5">
          <h3 className="text-lg font-bold mb-3">{t('promotion')}</h3>

          {remise ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              <span>
                {t('codeApplique', { code: remise.code, montant: euro(remise.montant) })}
              </span>
              <button
                type="button"
                onClick={retirerLeCode}
                className="text-green-700 underline hover:text-green-800"
              >
                {t('retirer')}
              </button>
            </div>
          ) : promoOuverte ? (
            <div className="flex gap-2">
              <input
                id="code-promo"
                type="text"
                aria-label={t('codePromo')}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') appliquerLeCode();
                }}
                className={champ}
                placeholder="BIENVENUE10"
                autoFocus
              />
              <button
                type="button"
                onClick={appliquerLeCode}
                disabled={codeEnCours || code.trim().length === 0}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {codeEnCours ? t('verification') : t('appliquer')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPromoOuverte(true)}
              className="w-full flex items-center gap-4 text-left hover:text-gray-900 text-gray-800"
            >
              <Tag size={20} className="text-gray-700 shrink-0" />
              <span className="flex-1 font-semibold">{t('ajouterCode')}</span>
              <ChevronRight size={20} className="text-gray-500" />
            </button>
          )}

          {codeRefuse && (
            <p role="status" className="mt-2 text-sm text-amber-700">
              {codeRefuse}
            </p>
          )}
        </div>

        {/* Le total, puis le bouton : on sait ce qu'on paie avant de cliquer. */}
        <div className="border-t-8 border-white px-6 py-5 space-y-3">
          <h3 className="text-lg font-bold">{t('totalCommande')}</h3>
          <div className="flex justify-between text-gray-700">
            <span>{t('sousTotal')}</span>
            <span>{euro(sousTotal)}</span>
          </div>
          {fraisDeService > 0 && (
            <div className="flex justify-between text-gray-700">
              <span>{t('fraisService')}</span>
              <span>{euro(fraisDeService)}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-700">
            <span>
              {t('livraison')}
              {enLivraison && livraison?.zone ? ` — ${livraison.zone.name}` : ''}
            </span>
            <span>{enLivraison ? euro(fraisDeLivraison) : t('retraitSurPlace')}</span>
          </div>
          {remise && (
            <div className="flex justify-between text-green-700">
              <span>{t('remise', { code: remise.code })}</span>
              <span>− {euro(remise.montant)}</span>
            </div>
          )}
          {pourboirePossible && (
            <div className="pt-1">
              <div className="flex justify-between text-gray-700">
                <span>{t('pourboire')}</span>
                <span>{pourboire > 0 ? euro(pourboire) : '—'}</span>
              </div>
              <div className="mt-2">
                {/* En % des articles, le montant écrit dessous. */}
                <ChoixPourboire base={Math.max(0, sousTotal - montantRemise)} onChange={setPourboire} />
              </div>
              <p className="mt-1 text-xs text-gray-500">{t('pourboireAide')}</p>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-3">
            <span>{t('total')}</span>
            <span>{euro(total)}</span>
          </div>

          {alerte}

          <AcceptationConditions
            coche={conditionsAcceptees}
            onChange={setConditionsAcceptees}
            documents={[{ href: '/cgv', libelle: t('cgv') }]}
            clair
          />

          <button
            onClick={commander}
            // Hors zone ou sous le minimum, le serveur refuserait : autant le dire
            // avant que le client valide.
            disabled={
              submitting ||
              !conditionsAcceptees ||
              sousLeMinimum ||
              (enLivraison && livraison?.livrable === false)
            }
            className="w-full py-4 bg-orange-600 hover:bg-orange-700 rounded-full text-lg text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? t('traitement')
              : sousLeMinimum
                ? t('minimum', { minimum: euro(livraison?.minimum ?? 0) })
                : enLivraison && livraison?.livrable === false
                  ? t('adresseNonLivree')
                  : t('confirmer')}
          </button>

          <p className="text-xs text-gray-500 leading-relaxed">
            {t('mentionConfirmation', { boutique: boutique.name })}
          </p>
        </div>
      </aside>
    </div>
  );
}

/** Le logo, le nom et l'adresse de la boutique, en tête du récapitulatif. */
function EnTeteBoutique({ boutique, adresse }: { boutique: BoutiqueCommandee; adresse: string }) {
  return (
    <>
      {boutique.logo ? (
        <img
          src={boutique.logo}
          alt=""
          className="w-14 h-14 rounded-full object-cover bg-gray-100 shrink-0"
        />
      ) : (
        <span className="w-14 h-14 rounded-full bg-red-600 text-white flex items-center justify-center text-xl font-bold shrink-0">
          {boutique.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-lg truncate">{boutique.name}</span>
        {adresse && <span className="block text-sm text-gray-500 truncate">{adresse}</span>}
      </span>
    </>
  );
}
