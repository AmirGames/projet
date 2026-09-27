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
 */

export type CodeReversement = "100" | "110" | "120" | "200" | "230" | "240" | "300";

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
  "200": {
    libelle: "Commission de la plateforme",
    explication: "Commission selon votre formule, figée au moment de chaque commande, payée en ligne ou sur place.",
  },
  "230": {
    libelle: "Frais de service encaissés sur place",
    explication: "Frais de service payés par vos clients sur place : vous les avez encaissés pour la plateforme.",
  },
  "240": {
    libelle: "Livraisons plateforme encaissées sur place",
    explication: "Courses de livreurs de la plateforme que vos clients vous ont payées : elles reviennent au livreur.",
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
}

const n = (v: unknown) => Number(v || 0);
const arrondi = (v: number) => Math.round(v * 100) / 100;

export function lignesDuReversement(commandes: CommandeAReverser[], report = 0) {
  const enLigne = commandes.filter((c) => c.paymentId);
  const surPlace = commandes.filter((c) => !c.paymentId);

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
    { code: "300", libelle: "", montant: report },
  ];

  // Une ligne à zéro n'apprend rien : seules les lignes utiles restent.
  const lignes = brut
    .map((l) => ({ ...l, montant: arrondi(l.montant), libelle: LIBELLES_REVERSEMENT[l.code].libelle }))
    .filter((l) => l.montant !== 0);

  const net = arrondi(lignes.reduce((s, l) => s + l.montant, 0));
  return { lignes, net };
}
