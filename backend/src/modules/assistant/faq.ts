import { agents, type Agent, type Service, type Category } from "./registry";
import { retrieveKnowledge } from "./knowledge";

export interface GuideContext {
  authenticated?: boolean;
  storeSelected?: boolean;
  previousQuestion?: string;
}
type Guide = {
  id: string;
  service: Service;
  audience: Category;
  title: string;
  question: string;
  matches: RegExp;
  answer: string;
  private?: boolean;
  store?: boolean;
};
const guides: Guide[] = [
  {
    id: "group",
    service: "ONE",
    audience: "orientation",
    title: "Découvrir ZupOne",
    question: "Quelles sont les activités de ZupOne ?",
    matches: /zupone|groupe|activite|presentation|bonjour|salut/,
    answer:
      "ZupOne regroupe ZupEat, pour les commandes de proximité et la livraison, et ZupDrive, pour le transport de personnes. La présentation publique de ZupDrive annonce encore « Bientôt disponible ». Choisissez ZupEat ou ZupDrive ci-dessous pour ouvrir le support correspondant.",
  },
  {
    id: "allergens",
    service: "EAT",
    audience: "customer",
    title: "Allergènes",
    question: "Comment vérifier les allergènes ?",
    matches: /allerg|intoleran/,
    answer:
      "Je ne dispose pas de données d’allergènes validées pour cet article. Contactez le commerce avant de commander ou de consommer ; aucune absence de risque ne peut être garantie.",
  },
  {
    id: "delay",
    service: "EAT",
    audience: "customer",
    title: "Commande en retard",
    question: "Ma commande est en retard, que faire ?",
    matches: /retard|pas arrive|pas recu|attends|attente.*commande/,
    private: true,
    answer:
      "1. Ouvrez « Mes commandes », puis « Actualiser le suivi » pour lire le statut actuel de votre commande.\n2. Si le problème persiste, choisissez « Parler à un conseiller » et indiquez le problème constaté.\n\nLe statut ne confirme pas une heure d’arrivée ; aucun délai de livraison n’est garanti par ce chat.",
  },
  {
    id: "missing",
    service: "EAT",
    audience: "customer",
    title: "Article manquant ou incorrect",
    question: "Il manque un article dans ma commande",
    matches: /manquant|manque|incorrect|mauvais article|erreur.*commande/,
    answer:
      "Précisez quels articles sont absents ou incorrects, puis utilisez « Parler à un conseiller » pour transmettre votre signalement avec votre accord. Une correction ou un remboursement éventuel demande un examen ; aucun remboursement n’est confirmé par cette réponse.",
  },
  {
    id: "eat-cancel",
    service: "EAT",
    audience: "customer",
    title: "Annuler une commande",
    question: "Comment annuler ma commande ?",
    matches: /annul/,
    answer:
      "L’annulation ZupEat depuis l’assistant est désactivée. Vérifiez votre commande dans le parcours client, puis choisissez « Parler à un conseiller » pour faire examiner votre demande. Cette réponse n’annule aucune commande et ne confirme aucun remboursement.",
  },
  {
    id: "eat-payment",
    service: "EAT",
    audience: "customer",
    title: "Vérifier le paiement",
    question: "Comment vérifier le paiement de ma commande ?",
    matches: /paiement|paye|debite|carte/,
    private: true,
    answer:
      "« Mes commandes » puis « Actualiser le suivi » présentent le statut de paiement enregistré pour votre commande. Les paiements par carte sont confirmés par le service de paiement. Pour signaler une anomalie, utilisez « Parler à un conseiller ». Ne partagez ni numéro de carte, ni cryptogramme, ni code bancaire dans le chat.",
  },
  {
    id: "eat-tracking",
    service: "EAT",
    audience: "customer",
    title: "Suivre une commande",
    question: "Comment suivre ma commande ?",
    matches: /suivi|suivre|commande|livraison|statut/,
    private: true,
    answer:
      "Choisissez « Mes commandes », puis « Actualiser le suivi » sur la commande concernée. Les outils vérifient votre compte et affichent uniquement vos commandes. Le statut provient du service métier actuel ; cette réponse ne prétend pas connaître l’état de votre commande.",
  },
  {
    id: "printing",
    service: "EAT",
    audience: "restaurant",
    title: "Problème d’impression",
    question: "Mon terminal n’imprime pas les commandes",
    matches: /imprim|impress|terminal/,
    answer:
      "Indiquez le terminal utilisé, l’écran concerné et le message d’erreur affiché. Vérifiez que la commande apparaît dans votre espace marchand. Si l’incident persiste, choisissez « Parler à un conseiller ». L’assistant n’a pas d’accès au matériel ; ne transmettez pas de données de paiement.",
  },
  {
    id: "availability",
    service: "EAT",
    audience: "restaurant",
    title: "Disponibilité d’un produit",
    question: "Comment rendre un produit indisponible ?",
    matches: /disponib|produit|catalogue|menu/,
    private: true,
    store: true,
    answer:
      "1. Choisissez « Voir les produits » dans l’établissement sélectionné.\n2. Sélectionnez le produit, puis « Rendre indisponible » ou « Rendre disponible ».\n3. Relisez l’établissement et le produit dans la proposition, puis confirmez si vous souhaitez l’exécuter.\n\nLa proposition ne modifie rien avant confirmation. La modification exige les droits de gestion ; les droits de lecture d’un employé ne suffisent pas.",
  },
  {
    id: "hours",
    service: "EAT",
    audience: "restaurant",
    title: "Horaires de l’établissement",
    question: "Comment modifier les horaires de mon établissement ?",
    matches: /horaire|ouverture|fermeture|plage/,
    private: true,
    store: true,
    answer:
      "« Voir les horaires » consulte les horaires actuels. Pour les modifier, ouvrez « Proposer des horaires », choisissez le jour et la plage, ou cochez « Fermé », puis relisez et confirmez la proposition. La plage peut se terminer après minuit. L’assistant propose une plage par jour dans son formulaire ; utilisez le gestionnaire d’horaires existant pour plusieurs plages. Les droits de gestion sont revérifiés à l’exécution.",
  },
  {
    id: "restaurant-orders",
    service: "EAT",
    audience: "restaurant",
    title: "Commandes de l’établissement",
    question: "Comment consulter les commandes de mon établissement ?",
    matches: /commande|suivi|statut/,
    private: true,
    store: true,
    answer:
      "Choisissez « Voir les commandes » pour consulter les statuts de l’établissement sélectionné. Le serveur vérifie vos permissions et le périmètre des boutiques. Les informations d’un autre établissement ne sont pas ajoutées automatiquement à ce contexte.",
  },
  {
    id: "absent",
    service: "EAT",
    audience: "courier",
    title: "Client absent",
    question: "Le client est absent, que faire ?",
    matches: /client absent|absen|remise|depot|preuve/,
    answer:
      "Suivez le parcours « client absent » de votre application livreur et la preuve de remise qu’il prévoit. Respectez l’attente et les options affichées par l’application ; ne fabriquez pas de preuve. Pour un incident, choisissez « Parler à un conseiller ».",
  },
  {
    id: "pickup",
    service: "EAT",
    audience: "courier",
    title: "Retrait ou restaurant en retard",
    question: "Le restaurant est en retard au retrait",
    matches: /retrait|restaurant|retard/,
    private: true,
    answer:
      "Consultez la course dans « Mes courses autorisées », puis suivez le parcours de retrait de l’application. Si le restaurant n’est pas prêt ou si le retrait est impossible, signalez le problème via « Parler à un conseiller ». Aucun nouveau délai ni changement de course n’est confirmé par cette réponse.",
  },
  {
    id: "courier-earnings",
    service: "EAT",
    audience: "courier",
    title: "Rémunération personnelle",
    question: "Comment vérifier ma rémunération de livraison ?",
    matches: /remuner|gain|revenu|paie|releve/,
    private: true,
    answer:
      "« Mes courses autorisées » affiche les gains personnels enregistrés lorsqu’ils sont disponibles ; les relevés sont dans votre espace livreur. Un gain enregistré ne confirme pas à lui seul un virement reçu. Pour une anomalie, demandez un conseiller ; l’assistant ne modifie pas une rémunération.",
  },
  {
    id: "ride-cancel",
    service: "DRIVE",
    audience: "passenger",
    title: "Annuler une course",
    question: "Comment annuler ma course ?",
    matches: /annul/,
    private: true,
    answer:
      "1. Ouvrez « Mes courses autorisées ».\n2. Si « Demander l’annulation » est disponible, préparez la proposition.\n3. Vérifiez la course et ses conséquences, puis confirmez.\n\nL’annulation est limitée aux états autorisés avant le début de la course. Aucune annulation n’est exécutée par cette réponse et aucun remboursement n’est annoncé en V1.",
  },
  {
    id: "lost-item",
    service: "DRIVE",
    audience: "passenger",
    title: "Objet perdu",
    question: "J’ai oublié un objet dans une course",
    matches: /objet|perdu|oublie/,
    answer:
      "Décrivez brièvement l’objet, puis utilisez « Parler à un conseiller » pour signaler la perte. Vous pouvez consulter vos propres courses pour retrouver celle concernée. L’assistant ne révèle pas les coordonnées privées du chauffeur et ne garantit pas que l’objet sera retrouvé.",
  },
  {
    id: "drive-payment",
    service: "DRIVE",
    audience: "passenger",
    title: "Paiement ZupDrive",
    question: "Comment fonctionne le paiement ZupDrive ?",
    matches: /paiement|paye|carte|debite/,
    answer:
      "Le paiement en ligne n’est pas intégré à ZupDrive V1. L’assistant ne peut donc pas exécuter de paiement ou de remboursement ZupDrive. Pour une question sur votre situation, utilisez « Parler à un conseiller » sans transmettre de coordonnées bancaires.",
  },
  {
    id: "ride-tracking",
    service: "DRIVE",
    audience: "passenger",
    title: "Suivre une course",
    question: "Comment suivre ma course ?",
    matches: /course|trajet|suivi|suivre|prise en charge/,
    private: true,
    answer:
      "« Mes courses autorisées » affiche les courses de votre contexte passager et leurs statuts enregistrés. Le serveur vérifie que la course vous appartient. Une heure de prise en charge ou l’identité privée du chauffeur ne sont pas déduites de cette réponse.",
  },
  {
    id: "driver-documents",
    service: "DRIVE",
    audience: "driver",
    title: "Justificatifs",
    question: "Où déposer mes justificatifs de chauffeur ?",
    matches: /document|justificatif|piece|dossier/,
    answer:
      "Déposez les justificatifs dans le portail chauffeur sécurisé existant. Les pièces jointes du chat sont désactivées. Pour un problème de dossier ou d’application, indiquez l’écran et le message d’erreur, puis demandez un conseiller.",
  },
  {
    id: "driver-earnings",
    service: "DRIVE",
    audience: "driver",
    title: "Rémunération ZupDrive",
    question: "Comment consulter ma rémunération ZupDrive ?",
    matches: /remuner|gain|revenu|paie|versement/,
    answer:
      "La rémunération et les reversements automatisés ne sont pas disponibles dans ZupDrive V1. L’assistant ne peut pas calculer ou modifier vos versements. Une question sur votre situation doit être examinée par un conseiller.",
  },
  {
    id: "driver-rides",
    service: "DRIVE",
    audience: "driver",
    title: "Course attribuée",
    question: "Je ne peux pas assurer une prise en charge",
    matches: /course|trajet|prise en charge|impossible|application/,
    private: true,
    answer:
      "Consultez « Mes courses autorisées » pour vérifier les courses attribuées dans votre contexte chauffeur. Pour une impossibilité de prise en charge ou un problème d’application, signalez les faits via « Parler à un conseiller ». L’assistant ne réattribue pas une course et ne décide pas d’une sanction.",
  },
  {
    id: "company-rides",
    service: "DRIVE",
    audience: "partner",
    title: "Courses de la société",
    question: "Comment consulter les courses de ma société ?",
    matches: /course|societe|flotte|entreprise/,
    private: true,
    answer:
      "« Mes courses autorisées » affiche uniquement les courses de la société dont votre compte est gérant. Choisissez votre contexte explicitement si vous êtes aussi passager ou chauffeur. Les paiements et reversements ZupDrive V1 sont désactivés.",
  },
  ...(["EAT", "DRIVE"] as const).map((service) => ({
    id: `${service.toLowerCase()}-commercial`,
    service,
    audience: "commercial" as const,
    title: "Devis ou démonstration",
    question: "Comment demander un devis ou une démonstration ?",
    matches: /devis|demo|parten|devenir|offre|tarif|commission|prix/,
    answer: `Pour une démonstration, un devis ou un partenariat ${service === "EAT" ? "ZupEat" : "ZupDrive"}, précisez votre activité et ce que vous souhaitez présenter, puis utilisez « Parler à un conseiller » pour transmettre votre demande avec votre accord. L’assistant ne dispose pas d’une grille commerciale validée ; aucun tarif, commission, contrat ni revenu n’est promis.`,
  })),
];

export const faqDocuments = guides.map((g) => ({
  ...g,
  status: "validated" as const,
  version: "1.0.0",
  effectiveAt: "2026-10-05",
  orgId: null,
  storeId: null,
  source:
    "Connaissances publiques du service et parcours AssistantWidget/BusinessPanel ; docs/assistant-zupone.md",
  knowledgeId:
    g.service === "ONE"
      ? "group-v1"
      : `${g.service.toLowerCase()}-${g.audience}-v1`,
}));
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function allowedGuides(agent: Agent) {
  const authorized = new Set(retrieveKnowledge(agent).map((d) => d.id));
  return faqDocuments.filter(
    (g) =>
      agent.enabled &&
      g.service === agent.service &&
      g.audience === agent.knowledgeAudience &&
      g.status === "validated" &&
      !g.orgId &&
      !g.storeId &&
      new Date(g.effectiveAt) <= new Date() &&
      authorized.has(g.knowledgeId),
  );
}
export function guideQuestions() {
  return agents
    .filter((a) => a.enabled)
    .flatMap((agent) =>
      allowedGuides(agent).map((g) => ({
        id: g.id,
        service: g.service,
        category: g.audience,
        title: g.title,
        question: g.question,
      })),
    );
}
const clarify: Record<Category, string> = {
  orientation:
    "Votre demande concerne ZupEat, ZupDrive ou les informations sur le groupe ?",
  customer:
    "Votre question porte sur le suivi, un retard, un article manquant, une annulation, un paiement ou les allergènes ?",
  restaurant:
    "Votre question porte sur les commandes, un produit, les horaires ou l’impression ?",
  courier:
    "Votre question porte sur le retrait, la remise, un client absent ou votre rémunération ?",
  passenger:
    "Votre question porte sur le suivi d’une course, une annulation, un objet perdu ou un paiement ?",
  driver:
    "Votre question porte sur une course, l’application, des justificatifs ou votre rémunération ?",
  partner:
    "Votre question porte sur les courses de votre société ou un autre besoin de gestion ?",
  commercial:
    "Souhaitez-vous une démonstration, un devis ou présenter une demande de partenariat ?",
};
export function guidedAnswer(
  agent: Agent | null,
  text: string,
  context: GuideContext = {},
) {
  if (!agent) return clarify.orientation;
  let question = normalize(text);
  if (
    /ignore.*regle|revele.*(prompt|secret)|affiche.*(mot de passe|cle api)|execute.*(sql|shell)|je suis administrateur/.test(
      question,
    )
  )
    return "Les droits viennent du compte connecté et sont vérifiés par le serveur. Le chat ne permet pas de les modifier ni de révéler des secrets. Choisissez un service et un support pour une demande autorisée.";
  if (
    /^(et maintenant|et ensuite|que faire|comment faire|oui|plus d.infos|comment)[ ?!.]*$/.test(
      question,
    ) &&
    context.previousQuestion
  )
    question = normalize(context.previousQuestion);
  const ownGuides = allowedGuides(agent);
  const guide = ownGuides.find((g) => g.matches.test(question));
  let answer: string;
  if (guide) {
    answer = guide.answer;
    if (guide.private && !context.authenticated)
      answer +=
        "\n\n[Connectez-vous](/login) avant toute consultation privée. La connexion ne donne accès qu’aux données autorisées pour votre compte.";
    else if (guide.store && !context.storeSelected)
      answer =
        "Choisissez d’abord « Choisir un établissement autorisé », puis sélectionnez l’établissement concerné.\n\n" +
        answer;
  } else {
    const other = agents
      .filter(
        (a) =>
          a.enabled &&
          a.service === agent.service &&
          a.category !== agent.category,
      )
      .flatMap((a) => allowedGuides(a))
      .find((g) => g.matches.test(question));
    const labels: Record<Category, string> = {
      orientation: "Informations sur ZupOne",
      customer: "Support clients",
      restaurant: "Support restaurants",
      courier: "Support livreurs",
      passenger: "Support passagers",
      driver: "Support chauffeurs",
      partner: "Support partenaires",
      commercial: "Devenir partenaire",
    };
    answer = other
      ? `Cette demande semble concerner « ${labels[other.audience]} ». Choisissez « Changer de catégorie » pour confirmer ce contexte ; vos données privées ne seront pas mélangées automatiquement.`
      : clarify[agent.category] +
        "\n\nSi votre demande ne figure pas dans ces sujets, utilisez « Parler à un conseiller ». Aucun tarif, statut ou délai non documenté n’est déduit de cette réponse.";
  }
  if (agent.category === "courier" || agent.category === "driver")
    answer +=
      "\n\nArrêtez-vous en sécurité avant de manipuler le chat si vous conduisez.";
  return answer;
}
