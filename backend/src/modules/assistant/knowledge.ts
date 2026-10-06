import type { Agent } from "./registry";

// Faits vérifiables dans le dépôt ; aucun tarif ni politique commerciale supposée.
export const knowledge = [
  {
    id: "group-v1",
    service: "ONE",
    audience: "orientation",
    status: "validated",
    version: "1",
    effectiveAt: "2026-10-05",
    orgId: null,
    storeId: null,
    content:
      "ZupOne regroupe ZupEat (commandes de proximité et livraison) et ZupDrive (transport de personnes). Un compte ZupOne commun ouvre les espaces auxquels la personne est autorisée. La présentation publique de ZupDrive annonce encore « Bientôt disponible ».",
    source: "README.md",
  },
  {
    id: "eat-customer-v1",
    service: "EAT",
    audience: "customer",
    status: "validated",
    version: "1",
    effectiveAt: "2026-10-05",
    orgId: null,
    storeId: null,
    content:
      "Le suivi et Mes commandes présentent le détail et le statut courant. Les paiements par carte sont confirmés par webhook Stripe. Une demande de remboursement, contestation ou annulation doit être examinée selon la commande ; aucun remboursement ni délai n’est garanti. Aucune base d’allergènes validée n’est disponible pour l’assistant : contactez le commerce et ne consommez pas un article en cas de doute.",
    source: "README.md; prisma/schema.prisma",
  },
  {
    id: "eat-restaurant-v1",
    service: "EAT",
    audience: "restaurant",
    status: "validated",
    version: "1",
    effectiveAt: "2026-10-05",
    orgId: null,
    storeId: null,
    content:
      "L’espace marchand gère commandes, catalogue, disponibilité et horaires par établissement. Une journée peut avoir plusieurs plages, y compris après minuit. Les justificatifs et coordonnées bancaires se traitent dans le profil sécurisé. Pour l’impression, signalez le terminal, l’écran et l’erreur, sans envoyer de données de paiement.",
    source: "README.md; modules/delivery/store-hours.service.ts",
  },
  {
    id: "eat-courier-v1",
    service: "EAT",
    audience: "courier",
    status: "validated",
    version: "1",
    effectiveAt: "2026-10-05",
    orgId: null,
    storeId: null,
    content:
      "Le parcours livreur gère retrait, remise et client absent. La remise exige la preuve prévue par l’application (code client ou dépôt photo autorisé après attente). Ne fabriquez jamais de preuve. Les relevés personnels sont dans l’espace livreur. Arrêtez-vous en sécurité avant de manipuler le chat.",
    source: "README.md; modules/drivers/delivery-proof.service.ts",
  },
  ...(["passenger", "driver", "partner", "commercial"] as const).map(
    (audience) => ({
      id: `drive-${audience}-v1`,
      service: "DRIVE",
      audience,
      status: "validated",
      version: "1",
      effectiveAt: "2026-10-05",
      orgId: null,
      storeId: null,
      content:
        "ZupDrive V1 possède des dossiers chauffeurs, sociétés et courses. Le paiement en ligne et les reversements ne sont pas intégrés en V1. Le passager peut demander l’annulation avant le début de la course selon son état. Les documents se déposent exclusivement dans le portail sécurisé. Aucun délai, revenu, tarif contractuel ni responsabilité d’accident ne peut être promis.",
      source: "README.md; modules/zupdrive/course-drive.service.ts",
    }),
  ),
  {
    id: "eat-commercial-v1",
    service: "EAT",
    audience: "commercial",
    status: "validated",
    version: "1",
    effectiveAt: "2026-10-05",
    orgId: null,
    storeId: null,
    content:
      "ZupEat s’adresse aux commerces de proximité. Une démonstration, un devis ou un partenariat peut être demandé au support avec votre accord. Aucune grille de tarifs commerciale validée n’est chargée dans l’assistant.",
    source: "README.md",
  },
];

export function retrieveKnowledge(agent: Agent, now = new Date()) {
  // Les documents privés sont refusés ici : leur ingestion reste désactivée
  // jusqu'à un adaptateur vérifiant le périmètre AVANT récupération.
  return knowledge.filter(
    (d) =>
      d.status === "validated" &&
      d.service === agent.service &&
      d.audience === agent.knowledgeAudience &&
      !d.orgId &&
      !d.storeId &&
      new Date(d.effectiveAt) <= now,
  );
}
