import type { ContenuDevenir } from '@/components/PageDevenir';
import { EMAIL_CONTACT } from '@/lib/editeur';
import type { Pays } from '@/lib/pays';

/**
 * Contenu des pages « Devenir … » par rôle et par pays. Les prérequis et la
 * FAQ suivent la réglementation du pays ; le reste est commun.
 *
 * Ajouter un pays : l'ajouter dans lib/pays.ts, puis compléter chaque rôle
 * ici (TypeScript signale les manquants).
 */
type ParPays = Record<Pays, ContenuDevenir>;

const CONDITIONS_LIVREURS = { libelle: 'conditions livreurs', href: '/conditions-livreurs' };
const CONDITIONS_COMMERCANTS = { libelle: 'conditions commerçants', href: '/conditions-commercants' };

// ─── Livreur ────────────────────────────────────────────────────────────────

const livreurCommun = {
  badge: 'Livreur Zupone',
  titre: 'Livrez près de chez vous, quand vous le voulez',
  accroche:
    'À vélo, en scooter ou en voiture : vous vous connectez quand vous êtes disponible, et les courses des commerces du quartier vous sont proposées.',
  cta: { libelle: 'Créer mon dossier livreur', href: '/driver/signup' },
  avantages: [
    { icone: '🕒', titre: 'Liberté d’horaires', texte: 'Pas de planning imposé : vous passez en ligne ou en pause d’un geste.' },
    { icone: '📍', titre: 'Courses proches', texte: 'Chaque course est proposée au livreur disponible le plus proche du commerce.' },
    { icone: '💶', titre: 'Rémunération claire', texte: 'Le montant de chaque course est affiché avant acceptation, et vos versements sont suivis dans votre espace.' },
  ],
  conditions: CONDITIONS_LIVREURS,
};

export const LIVREUR: ParPays = {
  BE: {
    ...livreurCommun,
    etapes: [
      { titre: 'Créez votre compte', texte: 'Nom, e‑mail, téléphone et type de véhicule.' },
      { titre: 'Envoyez vos pièces', texte: 'Carte d’identité ou titre de séjour, numéro d’entreprise (BCE) et documents du véhicule si besoin.' },
      { titre: 'Validation', texte: 'Notre équipe examine votre dossier une seule fois.' },
      { titre: 'Première course', texte: 'Passez en ligne, acceptez une course et remettez-la avec le code à 4 chiffres du client.' },
    ],
    prerequis: [
      'Avoir 18 ans ou plus',
      'Une carte d’identité belge, européenne ou un titre de séjour permettant de travailler en Belgique',
      'Un statut d’indépendant (à titre principal, complémentaire ou étudiant‑indépendant) avec numéro d’entreprise BCE et affiliation à une caisse d’assurances sociales',
      'Un vélo, un cyclomoteur, une moto ou une voiture — avec le permis correspondant (AM, A ou B) et une assurance RC pour les véhicules motorisés',
      'Un smartphone avec connexion internet et localisation',
    ],
    questions: [
      { question: 'Suis-je salarié de Zupone ?', reponse: 'Non, vous exercez comme indépendant et restez libre d’accepter ou de refuser les courses.' },
      { question: 'Je suis étudiant, puis-je livrer ?', reponse: 'Oui, sous le statut d’étudiant‑indépendant, à condition de respecter les règles de ce statut (inscription BCE et caisse d’assurances sociales).' },
      { question: 'Dois-je facturer la TVA ?', reponse: 'Cela dépend de votre chiffre d’affaires : sous le seuil de la franchise TVA, vous n’en facturez pas. Votre comptable ou votre guichet d’entreprise peut vous le confirmer.' },
      { question: 'Puis-je refuser une course ?', reponse: 'Oui. Une course refusée est simplement proposée au livreur suivant.' },
    ],
  },
  FR: {
    ...livreurCommun,
    etapes: [
      { titre: 'Créez votre compte', texte: 'Nom, e‑mail, téléphone et type de véhicule.' },
      { titre: 'Envoyez vos pièces', texte: 'Pièce d’identité, numéro SIRET et documents du véhicule si besoin.' },
      { titre: 'Validation', texte: 'Notre équipe examine votre dossier une seule fois.' },
      { titre: 'Première course', texte: 'Passez en ligne, acceptez une course et remettez-la avec le code à 4 chiffres du client.' },
    ],
    prerequis: [
      'Avoir 18 ans ou plus',
      'Une pièce d’identité valide et le droit de travailler en France',
      'Un statut d’indépendant (micro‑entreprise par exemple) avec numéro SIRET',
      'Un vélo, un scooter ou une voiture — avec permis et assurance pour les véhicules motorisés',
      'Un smartphone avec connexion internet et localisation',
    ],
    questions: [
      { question: 'Suis-je salarié de Zupone ?', reponse: 'Non, vous exercez en tant qu’indépendant et restez libre d’accepter ou de refuser les courses.' },
      { question: 'Comment obtenir un SIRET ?', reponse: 'En créant une micro‑entreprise sur le guichet unique de l’INPI ; le numéro est généralement attribué en quelques jours.' },
      { question: 'Puis-je refuser une course ?', reponse: 'Oui. Une course refusée est simplement proposée au livreur suivant.' },
    ],
  },
};

// ─── Commerçant ─────────────────────────────────────────────────────────────

const commercantCommun = {
  badge: 'Commerçant Zupone',
  titre: 'Votre commerce en ligne, en quelques minutes',
  accroche:
    'Restaurant, boulangerie, épicerie, fleuriste… Créez votre boutique, publiez votre catalogue et recevez des commandes livrées par des livreurs du quartier.',
  cta: { libelle: 'Créer ma boutique', href: '/merchant/register' },
  avantages: [
    { icone: '🏪', titre: 'Votre vitrine', texte: 'Une boutique à votre nom, avec votre catalogue, vos photos et vos prix.' },
    { icone: '🔔', titre: 'Commandes en direct', texte: 'Chaque commande arrive instantanément ; vous l’acceptez et suivez sa préparation.' },
    { icone: '🛵', titre: 'Livraison incluse', texte: 'Un livreur est automatiquement envoyé dès que la commande est prête.' },
  ],
  conditions: CONDITIONS_COMMERCANTS,
};

const questionsCommercant = [
  { question: 'Combien ça coûte ?', reponse: 'La création de la boutique est gratuite ; les formules et commissions sont détaillées dans votre espace commerçant.' },
  { question: 'Mes clients doivent-ils créer un compte ?', reponse: 'Non, ils peuvent commander sans compte.' },
  { question: 'Puis-je fermer temporairement ma boutique ?', reponse: 'Oui, vous gérez vos horaires et pouvez suspendre les commandes à tout moment.' },
];

export const COMMERCANT: ParPays = {
  BE: {
    ...commercantCommun,
    etapes: [
      { titre: 'Créez votre compte', texte: 'Nom du commerce, type d’établissement et adresse.' },
      { titre: 'Complétez le dossier', texte: 'Numéro d’entreprise (BCE), numéro de TVA et IBAN pour vos versements.' },
      { titre: 'Montez le catalogue', texte: 'Produits, horaires par service et zones de livraison sur la carte.' },
      { titre: 'Ouvrez', texte: 'Après validation, votre boutique est visible par les clients.' },
    ],
    prerequis: [
      'Un commerce inscrit à la Banque‑Carrefour des Entreprises (numéro d’entreprise) et, le cas échéant, un numéro de TVA',
      'Pour l’alimentaire : l’enregistrement ou l’autorisation de l’AFSCA pour votre activité',
      'Une adresse physique où les livreurs récupèrent les commandes',
      'Un IBAN professionnel pour recevoir vos versements',
      'Un appareil (téléphone, tablette ou ordinateur) pour recevoir les commandes',
    ],
    questions: [
      ...questionsCommercant,
      { question: 'La vente en ligne change-t-elle mes obligations AFSCA ?', reponse: 'Votre autorisation ou enregistrement AFSCA doit couvrir la vente à distance et la livraison. En cas de doute, vérifiez auprès de votre unité locale de contrôle.' },
    ],
  },
  FR: {
    ...commercantCommun,
    etapes: [
      { titre: 'Créez votre compte', texte: 'Nom du commerce, type d’établissement et adresse.' },
      { titre: 'Complétez le dossier', texte: 'SIRET, justificatifs et coordonnées bancaires pour vos versements.' },
      { titre: 'Montez le catalogue', texte: 'Produits, horaires par service et zones de livraison sur la carte.' },
      { titre: 'Ouvrez', texte: 'Après validation, votre boutique est visible par les clients.' },
    ],
    prerequis: [
      'Un commerce déclaré avec un numéro SIRET',
      'Pour l’alimentaire : la déclaration de votre établissement auprès de la DDPP',
      'Une adresse physique où les livreurs récupèrent les commandes',
      'Un IBAN professionnel pour recevoir vos versements',
      'Un appareil (téléphone, tablette ou ordinateur) pour recevoir les commandes',
    ],
    questions: questionsCommercant,
  },
};

// ─── Chauffeur VTC ──────────────────────────────────────────────────────────

const chauffeurCommun = {
  badge: 'Chauffeur VTC · Bientôt disponible',
  titre: 'Conduisez des passagers dans votre ville',
  accroche:
    'Zupone prépare son service de transport de personnes. Chauffeurs, faites-vous connaître dès maintenant pour faire partie des premiers sur la plateforme.',
  cta: {
    libelle: 'Je suis intéressé',
    href: `mailto:${EMAIL_CONTACT}?subject=${encodeURIComponent('Candidature chauffeur VTC')}`,
  },
  avantages: [
    { icone: '🕒', titre: 'Vous choisissez vos horaires', texte: 'Connectez-vous quand vous êtes disponible, sans planning imposé.' },
    { icone: '📍', titre: 'Courses à proximité', texte: 'Les demandes de trajet sont proposées au chauffeur disponible le plus proche.' },
    { icone: '💶', titre: 'Prix affiché à l’avance', texte: 'Le montant de la course est connu avant que vous l’acceptiez.' },
  ],
};

const questionsChauffeurCommunes = [
  { question: 'Quand le service ouvre-t-il ?', reponse: 'Le transport de personnes est en préparation. Les chauffeurs qui se sont fait connaître seront prévenus en premier.' },
  { question: 'Puis-je aussi livrer des commandes ?', reponse: 'Oui, vous pouvez créer un dossier livreur en parallèle depuis la page « Devenir livreur ».' },
];

export const CHAUFFEUR: ParPays = {
  BE: {
    ...chauffeurCommun,
    etapes: [
      { titre: 'Faites-vous connaître', texte: 'Envoyez-nous vos coordonnées et votre Région (Bruxelles, Wallonie ou Flandre).' },
      { titre: 'Dossier', texte: 'Autorisation d’exploitation régionale, permis, certificat de sélection médicale, assurance.' },
      { titre: 'Validation', texte: 'Notre équipe vérifie vos documents et votre véhicule.' },
      { titre: 'Premiers trajets', texte: 'À l’ouverture du service, passez en ligne et acceptez vos courses.' },
    ],
    prerequis: [
      'Une autorisation d’exploitation délivrée par votre Région : Bruxelles‑Capitale, Wallonie (location de voiture avec chauffeur) ou Flandre (vergunning individueel bezoldigd personenvervoer)',
      'Un permis B valide et un certificat de sélection médicale (chauffeur professionnel)',
      'Un extrait de casier judiciaire récent',
      'Un véhicule conforme aux exigences de votre Région, avec une assurance couvrant le transport rémunéré de personnes',
      'Un statut d’indépendant ou une société, avec numéro d’entreprise BCE',
    ],
    questions: [
      questionsChauffeurCommunes[0],
      { question: 'Les règles sont-elles les mêmes partout en Belgique ?', reponse: 'Non, le transport rémunéré de personnes est réglementé par chaque Région. Les documents demandés dépendent de la Région où vous exercez.' },
      { question: 'Je n’ai pas encore d’autorisation, puis-je candidater ?', reponse: 'L’autorisation régionale est obligatoire pour transporter des passagers. En attendant, vous pouvez devenir livreur.' },
      questionsChauffeurCommunes[1],
    ],
  },
  FR: {
    ...chauffeurCommun,
    etapes: [
      { titre: 'Faites-vous connaître', texte: 'Envoyez-nous vos coordonnées et votre ville.' },
      { titre: 'Dossier', texte: 'Carte VTC, permis, inscription au registre VTC, assurance et statut d’indépendant.' },
      { titre: 'Validation', texte: 'Notre équipe vérifie vos documents et votre véhicule.' },
      { titre: 'Premiers trajets', texte: 'À l’ouverture du service, passez en ligne et acceptez vos courses.' },
    ],
    prerequis: [
      'Une carte professionnelle VTC en cours de validité',
      'Un permis B depuis au moins 3 ans',
      'Une inscription au registre des exploitants VTC',
      'Un véhicule conforme aux exigences VTC, avec une assurance transport de personnes',
      'Un statut d’indépendant (société ou micro‑entreprise) avec numéro SIRET',
    ],
    questions: [
      questionsChauffeurCommunes[0],
      { question: 'Je n’ai pas encore ma carte VTC, puis-je candidater ?', reponse: 'La carte VTC est obligatoire pour transporter des passagers. En attendant, vous pouvez devenir livreur en voiture.' },
      questionsChauffeurCommunes[1],
    ],
  },
};
