/**
 * Le calcul d'un relevé de reversement commerçant, ligne par ligne.
 *
 * Pur, sans base : le service lui donne les commandes, il rend les lignes. Chaque
 * ligne porte un code, comme sur une fiche de paie, expliqué en bas du relevé.
 *
 * Deux sortes de commandes :
 * - payées en ligne : l'argent est chez la plateforme, qui doit au commerçant
 *   ses articles (remise déduite) et la livraison quand il l'assure lui-même ;
 * - payées sur place : le commerçant a déjà tout en main, frais de service
 *   compris. La plateforme retient ce qui lui revient.
 * La commission se retient sur les deux.
 *
 * Une commande perdue en livraison par un livreur de la plateforme (annulée,
 * motif DELIVERY_FAILED) est payée au commerçant comme une vente : il a fait
 * son travail, la plateforme rembourse le client et absorbe la perte. Elle a sa
 * propre ligne (130), quel que soit le moyen de paiement : le commerçant n'a
 * rien encaissé, même pour une commande à payer à la remise.
 */

export type CodeReversement = "100" | "110" | "120" | "130" | "200" | "210" | "230" | "240" | "300" | "310";

export const LIBELLES_REVERSEMENT: Record<CodeReversement, { libelle: string; explication: string }> = {
  "100": {
    libelle: "Ventes d'articles payées en ligne",
    explication: "Total des articles vendus, payés en ligne par vos clients et encaissés par la plateforme pour vous.",
  },
  "110": {
    libelle: "Remises accordées",
    explication: "Réductions de vos codes promo sur ces ventes : c'est vous qui les accordez.",
  },
  "120": {
    libelle: "Livraisons par vos livreurs",
    explication: "Frais de livraison payés en ligne par vos clients quand vous livrez vous-même : ils vous reviennent.",
  },
  "130": {
    libelle: "Commandes perdues en livraison, prises en charge",
    explication:
      "Commandes préparées que le livreur de la plateforme n'a pas livrées : la plateforme rembourse le client et vous les paie comme des ventes (articles, remise déduite).",
  },
  "200": {
    libelle: "Commission de la plateforme",
    explication: "Commission selon votre formule, figée au moment de chaque commande, payée en ligne ou sur place.",
  },
  "210": {
    libelle: "Commission restituée sur remboursements",
    explication: "Part de la commission que la plateforme vous rend sur les montants remboursés à vos clients.",
  },
  "230": {
    libelle: "Frais de service encaissés sur place",
    explication: "Frais de service payés par vos clients sur place : vous les avez encaissés pour la plateforme.",
  },
  "240": {
    libelle: "Livraisons plateforme encaissées sur place",
    explication: "Courses de livreurs de la plateforme que vos clients vous ont payées : elles reviennent au livreur.",
  },
  "310": {
    libelle: "Remboursements à vos clients",
    explication:
      "Part de vos ventes rendue à vos clients (remboursement total ou partiel), au prorata du montant remboursé. Une vente déjà versée se corrige ici, jamais en la retirant du relevé qui l'a payée.",
  },
  "300": {
    libelle: "Report du relevé précédent",
    explication: "Solde négatif d'un relevé précédent (plus de retenues que de ventes), repris ici.",
  },
};

export interface LigneReversement {
  code: CodeReversement;
  libelle: string;
  montant: number;
  /** Le nombre de commandes concernées, quand c'est parlant. */
  nombre?: number;
}

export interface CommandeAReverser {
  totalAmount: unknown;
  feesAmount: unknown;
  serviceFeeAmount: unknown;
  discountAmount: unknown;
  commissionAmount: unknown;
  deliveryMode: string | null;
  /** Payée en ligne : l'argent est passé par la plateforme. */
  paymentId: string | null;
  /** Perdue en livraison par un livreur de la plateforme : payée par elle (ligne 130). */
  priseEnCharge?: boolean;
}

const n = (v: unknown) => Number(v || 0);
const arrondi = (v: number) => Math.round(v * 100) / 100;

/** Ce qu'un remboursement client change au relevé, en euros signés. */
export interface AjustementRemboursement {
  /** Part des ventes du commerçant rendue (négatif). */
  partCommercant: number;
  /** Commission rendue par la plateforme (positif). */
  commission: number;
  /** Le nombre de commandes concernées. */
  nombre: number;
}

const centimes = (v: number) => Math.round(v * 100);

/**
 * La correction due pour une commande dont le client a été remboursé
 * (D2 : au prorata du montant remboursé).
 *
 * Le calcul est cumulatif : on compare la part due pour tout ce qui est
 * remboursé à la part déjà répercutée par les relevés précédents. Le total
 * versé après plusieurs remboursements partiels ne dépend donc pas des
 * arrondis intermédiaires, et un remboursement total rend exactement la part
 * du commerçant et la commission. Arrondi au centime le plus proche, par
 * montant cumulé.
 */
export function ajustementRemboursement(
  commande: CommandeAReverser,
  rembourse: number,
  dejaRepercute: number,
): { partCommercant: number; commission: number } {
  const total = centimes(n(commande.totalAmount));
  if (!commande.paymentId || commande.priseEnCharge || total <= 0) return { partCommercant: 0, commission: 0 };

  const lignes = lignesDuReversement([commande]).lignes;
  const part = centimes(
    lignes.filter((l) => l.code === "100" || l.code === "110" || l.code === "120").reduce((s, l) => s + l.montant, 0),
  );
  const commission = centimes(-(lignes.find((l) => l.code === "200")?.montant ?? 0));

  const cumul = (montant: number) => {
    const m = Math.min(Math.max(centimes(montant), 0), total);
    return { part: Math.round((part * m) / total), commission: Math.round((commission * m) / total) };
  };
  const maintenant = cumul(rembourse);
  const avant = cumul(dejaRepercute);
  return {
    partCommercant: -(maintenant.part - avant.part) / 100 || 0,
    commission: (maintenant.commission - avant.commission) / 100,
  };
}

export function lignesDuReversement(
  commandes: CommandeAReverser[],
  report = 0,
  ajustements: AjustementRemboursement = { partCommercant: 0, commission: 0, nombre: 0 },
) {
  const perdues = commandes.filter((c) => c.priseEnCharge);
  const vendues = commandes.filter((c) => !c.priseEnCharge);
  const enLigne = vendues.filter((c) => c.paymentId);
  const surPlace = vendues.filter((c) => !c.paymentId);

  // Articles TTC avant remise : ce que le client a payé, moins la livraison et
  // les frais de service, plus la remise qu'il n'a pas payée.
  const articles = (c: CommandeAReverser) =>
    n(c.totalAmount) - n(c.feesAmount) - n(c.serviceFeeAmount) + n(c.discountAmount);

  const avecLivraisonPropre = enLigne.filter((c) => c.deliveryMode === "OWN" && n(c.feesAmount) > 0);
  const avecRemise = enLigne.filter((c) => n(c.discountAmount) > 0);
  const servicesSurPlace = surPlace.filter((c) => n(c.serviceFeeAmount) > 0);
  const livraisonsPlateformeSurPlace = surPlace.filter(
    (c) => c.deliveryMode === "PLATFORM" && n(c.feesAmount) > 0
  );

  const brut: LigneReversement[] = [
    {
      code: "100",
      libelle: "",
      montant: enLigne.reduce((s, c) => s + articles(c), 0),
      nombre: enLigne.length,
    },
    { code: "110", libelle: "", montant: -avecRemise.reduce((s, c) => s + n(c.discountAmount), 0), nombre: avecRemise.length },
    {
      code: "120",
      libelle: "",
      montant: avecLivraisonPropre.reduce((s, c) => s + n(c.feesAmount), 0),
      nombre: avecLivraisonPropre.length,
    },
    {
      code: "130",
      libelle: "",
      // Les articles, remise déduite : ce que la vente lui aurait rapporté.
      montant: perdues.reduce((s, c) => s + articles(c) - n(c.discountAmount), 0),
      nombre: perdues.length,
    },
    {
      // Sur toutes les commandes, perdues comprises : comme pour une vente.
      code: "200",
      libelle: "",
      montant: -commandes.reduce((s, c) => s + n(c.commissionAmount), 0),
      nombre: commandes.length,
    },
    {
      code: "230",
      libelle: "",
      montant: -servicesSurPlace.reduce((s, c) => s + n(c.serviceFeeAmount), 0),
      nombre: servicesSurPlace.length,
    },
    {
      code: "240",
      libelle: "",
      montant: -livraisonsPlateformeSurPlace.reduce((s, c) => s + n(c.feesAmount), 0),
      nombre: livraisonsPlateformeSurPlace.length,
    },
    { code: "210", libelle: "", montant: ajustements.commission, nombre: ajustements.nombre },
    { code: "310", libelle: "", montant: ajustements.partCommercant, nombre: ajustements.nombre },
    { code: "300", libelle: "", montant: report },
  ];

  // Une ligne à zéro n'apprend rien : seules les lignes utiles restent.
  const lignes = brut
    .map((l) => ({ ...l, montant: arrondi(l.montant), libelle: LIBELLES_REVERSEMENT[l.code].libelle }))
    .filter((l) => l.montant !== 0);

  const net = arrondi(lignes.reduce((s, l) => s + l.montant, 0));
  return { lignes, net };
}
