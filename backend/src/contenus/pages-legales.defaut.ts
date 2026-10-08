/**
 * Textes légaux de départ, en Markdown.
 *
 * Servis tant que la plateforme n'a publié aucune version d'une page depuis
 * l'espace superowner (Pages légales). Les valeurs entre crochets sont à
 * remplacer avant l'ouverture au public.
 */
export const VERSION_INITIALE = "2026-10-08";

export const SLUGS_LEGAUX = [
  "mentions-legales",
  "cgu",
  "cgv",
  "conditions-commercants",
  "conditions-livreurs",
  "confidentialite",
  "cookies",
  "accessibilite",
] as const;

export type SlugLegal = (typeof SLUGS_LEGAUX)[number];

export const PAGES_LEGALES_DEFAUT: Record<SlugLegal, { titre: string; contenu: string }> = {
  "mentions-legales": {
    titre: "Mentions légales",
    contenu: `Conformément à l'article 6-III de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN), voici l'identité des intervenants du site zupeat.com et de ses déclinaisons (zupeat.com, zupdrive.com).

## Éditeur

- [Raison sociale], [SAS / SARL / EI…] au capital de [montant] €
- Siège social : [Adresse du siège social]
- RCS : [Ville d'immatriculation] [numéro SIREN]
- TVA intracommunautaire : [Numéro de TVA intracommunautaire]
- Courriel : [contact@zupeat.com](mailto:contact@zupeat.com) — Téléphone : [Téléphone]
- Directeur de la publication : [Nom du directeur de la publication]

## Hébergement

[Nom de l'hébergeur], [Adresse de l'hébergeur], [Téléphone de l'hébergeur].

## Rôle de ZupEat

ZupEat est une plateforme d'intermédiation. Les produits sont vendus par les commerçants partenaires, qui en sont seuls vendeurs et responsables ; chaque vitrine indique l'identité du commerçant concerné. ZupEat met en relation clients, commerçants et livreurs et encaisse les paiements pour le compte des commerçants.

## Propriété intellectuelle

La marque ZupEat, le site, son code et ses contenus propres sont protégés. Toute reproduction sans autorisation écrite est interdite. Les photos et descriptions de produits appartiennent aux commerçants qui les publient. Les fonds de carte proviennent d'OpenStreetMap (© contributeurs OpenStreetMap, licence ODbL).

## Signaler un contenu illicite

Conformément au règlement (UE) 2022/2065 (Digital Services Act), toute personne peut signaler un contenu qu'elle estime illicite (produit interdit, contrefaçon, avis frauduleux, etc.) à [contact@zupeat.com](mailto:contact@zupeat.com). Le signalement indique :

- l'adresse exacte de la page concernée ;
- les raisons pour lesquelles le contenu est illicite ;
- le nom et l'adresse électronique de l'auteur du signalement (sauf infractions relevant des articles 3 à 7 de la directive 2011/93/UE).

Nous accusons réception, examinons chaque signalement avec diligence et informons son auteur de la décision prise et des voies de recours. Lorsque nous retirons un contenu ou suspendons un compte, l'utilisateur concerné reçoit un exposé des motifs et peut contester la décision en répondant au même courriel, puis saisir un organisme de règlement extrajudiciaire des litiges ou la justice.

Point de contact unique pour les autorités des États membres, la Commission européenne et les utilisateurs : [contact@zupeat.com](mailto:contact@zupeat.com), en français ou en anglais.

## Médiation de la consommation

En cas de litige non résolu avec notre service client, le consommateur peut recourir gratuitement au médiateur : [Nom du médiateur de la consommation] ([Site du médiateur]).`,
  },

  cgu: {
    titre: "Conditions générales d'utilisation",
    contenu: `Les présentes conditions encadrent l'accès et l'usage de la plateforme ZupEat, éditée par [Raison sociale] (voir les [mentions légales](/mentions-legales)). Utiliser le site, avec ou sans compte, vaut acceptation de ces conditions.

## 1. Objet

ZupEat permet aux clients de commander auprès de commerces de proximité, en retrait ou en livraison, aux commerçants de gérer leur boutique en ligne et aux livreurs de réaliser des courses. Les ventes elles-mêmes relèvent des [conditions générales de vente](/cgv).

## 2. Compte

- La commande est possible sans compte ; le compte permet de suivre ses commandes et de retrouver ses paniers.
- Les informations fournies doivent être exactes et tenues à jour.
- L'utilisateur garde son mot de passe confidentiel et répond de l'usage de son compte.
- Il faut avoir 16 ans pour créer un compte, et 18 ans pour commander de l'alcool.
- Le compte peut être supprimé à tout moment sur simple demande à [contact@zupeat.com](mailto:contact@zupeat.com).

## 3. Comportements interdits

- passer de fausses commandes ou usurper l'identité d'autrui ;
- publier des contenus illicites, trompeurs, injurieux ou portant atteinte aux droits de tiers ;
- tenter d'accéder aux données d'autres utilisateurs ou de perturber le service ;
- extraire massivement les données du site par des moyens automatisés ;
- contourner la plateforme pour régler une commande passée via ZupEat.

Tout manquement peut entraîner la restriction, la suspension ou la fermeture du compte, après information de l'intéressé sauf urgence.

## 4. Avis et notes

Les notes attribuées aux livreurs reflètent l'expérience réelle de l'utilisateur. ZupEat peut retirer une note manifestement abusive. Les notes ne sont pas rémunérées.

## 5. Disponibilité

ZupEat s'efforce de maintenir le service accessible mais ne garantit pas une disponibilité continue : des interruptions pour maintenance peuvent survenir, annoncées lorsque c'est possible.

## 6. Responsabilité

ZupEat répond du bon fonctionnement de la plateforme. Chaque commerçant répond des produits qu'il vend et des informations de sa vitrine (prix, allergènes, disponibilité).

## 7. Données personnelles

Voir la [politique de confidentialité](/confidentialite) et la page [cookies](/cookies).

## 8. Modification

Ces conditions peuvent évoluer. Les titulaires d'un compte sont prévenus de toute modification substantielle au moins 15 jours avant son entrée en vigueur.

## 9. Droit applicable

Droit français. En cas de litige, une solution amiable est recherchée en priorité ; le consommateur peut saisir le médiateur mentionné dans les mentions légales ou la juridiction compétente selon les règles de droit commun.`,
  },

  cgv: {
    titre: "Conditions générales de vente",
    contenu: `Ces conditions s'appliquent à toute commande passée par un client auprès d'un commerçant via ZupEat. Le vendeur est le commerçant dont l'identité figure sur la vitrine ; ZupEat agit en intermédiaire et encaisse le paiement pour son compte.

## 1. Commande

Le client compose son panier, choisit le retrait ou la livraison, et valide après avoir vu le récapitulatif : produits, frais de livraison, frais de service et total TTC. La commande est ferme une fois le paiement accepté ; le commerçant peut la refuser (rupture, fermeture, zone non desservie), auquel cas le client est intégralement remboursé.

## 2. Prix

Les prix sont affichés en euros TTC, fixés par chaque commerçant. S'y ajoutent, affichés avant validation :

- les frais de livraison, selon la zone de l'adresse ;
- des frais de service de 0,25 € par commande, perçus par ZupEat ;
- le cas échéant, un minimum de commande propre au commerçant.

## 3. Paiement

Le paiement s'effectue par carte bancaire via notre prestataire Stripe. ZupEat ne stocke jamais les données de carte. Le débit intervient à la validation de la commande.

## 4. Retrait et livraison

Les délais et créneaux sont indicatifs. En livraison, le client doit être joignable à l'adresse indiquée ; une preuve de remise peut être recueillie par le livreur. Le suivi de la course est disponible en temps réel.

## 5. Annulation

Le client peut annuler sans frais tant que le commerçant n'a pas accepté la commande, dans le délai affiché. Au-delà, l'annulation n'est plus possible, la préparation ayant commencé.

## 6. Droit de rétractation

Conformément à l'article L221-28 du Code de la consommation, le droit de rétractation ne s'applique pas aux denrées susceptibles de se détériorer ou de se périmer rapidement, ni aux biens confectionnés selon les spécifications du client. Pour les autres produits non périssables, le client dispose de 14 jours à compter de la réception pour se rétracter, en contactant [contact@zupeat.com](mailto:contact@zupeat.com).

## 7. Réclamations

Produit manquant, erroné ou non conforme : signalez-le depuis votre espace (support) ou à [contact@zupeat.com](mailto:contact@zupeat.com) dans les 48 heures, avec si possible une photo. Un remboursement total ou partiel est accordé lorsque la réclamation est fondée. Les garanties légales de conformité et des vices cachés restent applicables.

## 8. Allergènes et alcool

Les informations sur les allergènes sont fournies par le commerçant ; en cas de doute, contactez-le avant de commander. La vente d'alcool est interdite aux mineurs : une pièce d'identité peut être demandée à la remise.

## 9. Litiges

Voir la médiation dans les [mentions légales](/mentions-legales). Droit français applicable.`,
  },

  "conditions-commercants": {
    titre: "Conditions générales commerçants",
    contenu: `Ces conditions lient ZupEat et tout professionnel qui ouvre une boutique sur la plateforme. Elles complètent les [CGU](/cgu).

## 1. Inscription

Le commerçant fournit un dossier exact et à jour (identité de l'entreprise, SIRET, TVA le cas échéant, coordonnées bancaires, autorisations propres à son activité). ZupEat peut refuser ou suspendre une boutique dont le dossier est incomplet ou inexact.

## 2. Obligations du commerçant

- il est le vendeur et répond de la conformité, de l'hygiène et de la sécurité des produits ;
- il affiche des prix TTC exacts et renseigne, pour chaque produit, les allergènes parmi les quatorze de l'annexe II du règlement (UE) 1169/2011 ; un produit sans allergène est déclaré comme tel ;
- il signale les produits contenant de l'alcool, dont la vente est interdite aux mineurs, et s'assure de la majorité du client à la remise ;
- il tient à jour ses horaires, stocks et zones de livraison ;
- il accepte ou refuse chaque commande dans le délai prévu ;
- lorsqu'il assure sa propre livraison, il en porte la responsabilité et respecte le droit du travail et des transports.

## 3. Formules et commissions

Le commerçant souscrit une formule (prix, nombre de boutiques) et paie une commission sur les ventes, dont le taux dépend de qui livre (propre livraison ou livreurs de la plateforme). Les tarifs en vigueur sont affichés lors de la souscription ; toute hausse est notifiée au moins 30 jours à l'avance, le commerçant pouvant alors résilier sans frais.

## 4. Encaissement et reversement

ZupEat encaisse le paiement des clients pour le compte du commerçant, via Stripe, et lui reverse les sommes dues après déduction des commissions et frais. Une facture mensuelle détaille chaque ligne.

Conformément à la directive (UE) 2021/514 (DAC7), ZupEat collecte et transmet chaque année à l'administration fiscale les informations relatives aux commerçants actifs et aux sommes perçues (identité, adresse, numéro d'identification fiscale ou SIREN, TVA, IBAN, nombre de transactions et montants par trimestre). Le commerçant s'engage à fournir ces informations ; à défaut, ZupEat peut retenir les reversements après deux relances.

## 5. Données des clients

Le commerçant n'utilise les données des clients que pour exécuter les commandes. Toute prospection commerciale suppose le consentement du client. Il agit en responsable de traitement pour ses propres usages et garantit leur conformité au RGPD.

## 6. Contenus

Le commerçant garantit détenir les droits sur les photos, logos et textes qu'il publie, et concède à ZupEat le droit de les afficher pour la durée de la relation.

## 7. Suspension et résiliation

Chaque partie peut résilier à tout moment avec un préavis de 30 jours. ZupEat peut suspendre sans préavis une boutique en cas de manquement grave (fraude, produits dangereux, plaintes répétées), en motivant sa décision conformément au règlement (UE) 2019/1150.

## 8. Classement

L'ordre d'affichage des commerces dépend principalement de la distance, de l'ouverture et de la zone de livraison. Aucun classement payant n'est pratiqué à ce jour.

## 9. Réclamations et droit applicable

Les réclamations passent par le support commerçant. Droit français ; tribunal de commerce du siège de ZupEat compétent.`,
  },

  "conditions-livreurs": {
    titre: "Conditions générales livreurs",
    contenu: `Ces conditions lient ZupEat et les livreurs indépendants qui réalisent des courses via la plateforme. Elles complètent les [CGU](/cgu).

## 1. Statut

Le livreur exerce en tant que travailleur indépendant (micro-entrepreneur ou société). Il n'est lié par aucun lien de subordination : il choisit librement ses périodes de connexion, peut refuser une course sans pénalité et peut travailler pour d'autres plateformes.

## 2. Validation du dossier

Avant toute course, le livreur fournit : pièce d'identité, justificatif d'immatriculation, droit de travailler en France, et selon le véhicule permis, carte grise et assurance adaptée. ZupEat valide le dossier et peut le refuser s'il est incomplet ou non conforme.

## 3. Réalisation des courses

- le prix de chaque course est affiché avant acceptation ;
- le livreur remet la commande en l'état, dans le respect du code de la route ;
- il peut être demandé une preuve de remise (photo, code) ;
- la localisation n'est partagée que pendant une course ou une période de disponibilité.

## 4. Rémunération

Les sommes dues sont reversées périodiquement ; le détail des versements est consultable dans l'espace livreur. Le livreur s'acquitte lui-même de ses cotisations sociales et impôts. Conformément à la directive (UE) 2021/514 (DAC7), ZupEat déclare chaque année à l'administration fiscale les sommes versées au livreur ; celui-ci fournit pour cela son identité, son adresse, son numéro d'identification fiscale ou SIREN et son IBAN.

## 5. Notes

Les clients peuvent noter les livraisons. Les notes ne sont jamais la seule base d'une désactivation, qui est toujours motivée et peut être contestée auprès du support.

## 6. Assurance et sécurité

Le livreur justifie d'une assurance responsabilité civile professionnelle et d'une assurance de son véhicule couvrant l'usage professionnel. Il peut signaler tout incident via l'application.

## 7. Fin de la relation

Le livreur peut clôturer son compte à tout moment. ZupEat peut désactiver un compte en cas de fraude, de mise en danger ou de manquement grave, après en avoir exposé les motifs.`,
  },

  confidentialite: {
    titre: "Politique de confidentialité",
    contenu: `[Raison sociale] (ZupEat) est responsable des traitements décrits ci-dessous, conformément au règlement (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés. Chaque commerçant est responsable des traitements qu'il réalise pour ses propres besoins.

## Données traitées et finalités

| Finalité | Données | Base légale | Durée |
| --- | --- | --- | --- |
| Gestion du compte | nom, e-mail, téléphone, mot de passe (chiffré) | contrat | jusqu'à suppression, ou 3 ans d'inactivité |
| Commandes et livraison | produits, adresse, coordonnées, instructions, historique | contrat | durée de la relation, puis 5 ans (prescription) |
| Paiement | montant, statut ; la carte est traitée par Stripe seul | contrat | 10 ans pour les pièces comptables |
| Suivi en temps réel | position du livreur pendant la course | contrat | durée de la course, puis trace conservée 1 an pour litiges |
| Dossier commerçant / livreur | pièces justificatives, SIRET, coordonnées bancaires | contrat et obligation légale | durée de la relation + 5 ans |
| Preuve d'acceptation des conditions | e-mail, documents et versions acceptés, adresse IP, navigateur, date | obligation légale / intérêt légitime | 5 ans après la fin de la relation |
| Support et réclamations | messages, pièces jointes | intérêt légitime | 3 ans après clôture |
| Sécurité et prévention de la fraude | journaux de connexion, adresse IP | obligation légale / intérêt légitime | 1 an |
| Offres de votre région | région choisie, commandes agrégées et anonymes (seuil minimal d'acheteurs) | intérêt légitime | 3 ans |
| Suggestions personnalisées (compte connecté) | types de cuisine de vos commandes passées | intérêt légitime, avec droit d'opposition | calculées à la demande, sans copie conservée |
| Notifications | abonnement aux notifications push | consentement | jusqu'au retrait du consentement |

## Personnalisation

Si vous avez un compte, nous vous suggérons des commerces proches des types de cuisine que vous commandez le plus. Ce calcul est fait à la volée sur vos commandes ; aucun profil n'est conservé, aucune décision ne produit d'effet juridique et rien n'est transmis aux commerçants. Les catégories pouvant révéler une appartenance religieuse ou une donnée de santé ne servent jamais à personnaliser. Vous pouvez désactiver la personnalisation à tout moment dans les réglages de votre compte ; les clients sans compte ne sont pas profilés. Les tendances de votre région sont des statistiques agrégées, publiées uniquement au-delà d'un nombre minimal d'acheteurs.

## Destinataires

- le commerçant et, en livraison, le livreur, pour ce qui est nécessaire à la commande ;
- Stripe (paiement) ;
- notre hébergeur ([Nom de l'hébergeur]) ;
- le service de géocodage Photon (Komoot) pour les suggestions d'adresse, et OpenStreetMap pour l'affichage des cartes ;
- les autorités, sur réquisition légale.

Nous ne vendons aucune donnée. Lorsqu'un prestataire traite des données hors de l'Union européenne, le transfert est encadré par les clauses contractuelles types de la Commission européenne ou une décision d'adéquation.

## Vos droits

Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition, de portabilité et du droit de retirer votre consentement, ainsi que de définir des directives sur le sort de vos données après votre décès. Écrivez à [dpo@zupeat.com](mailto:dpo@zupeat.com) ; nous répondons sous un mois. Vous pouvez aussi saisir la CNIL ([cnil.fr](https://www.cnil.fr)).

## Sécurité

Mots de passe hachés, échanges chiffrés (HTTPS), accès restreint par rôle et journalisé, sauvegardes régulières.

## Cookies

Voir la page [cookies et traceurs](/cookies).`,
  },

  cookies: {
    titre: "Cookies et traceurs",
    contenu: `ZupEat n'utilise **aucun cookie publicitaire ni de mesure d'audience tierce**. Les seuls traceurs déposés sont strictement nécessaires au service ; conformément à l'article 82 de la loi Informatique et Libertés, ils sont exemptés de consentement.

## Traceurs utilisés

| Nom | Type | Rôle | Durée |
| --- | --- | --- | --- |
| ZUPEAT_REGION | cookie | mémoriser la région et la langue du site | 1 an |
| pays | cookie | mémoriser le pays choisi pour n'afficher que les commerces et offres de votre région | 1 an |
| zup_refresh | cookie HttpOnly | renouveler la session sans ressaisir le mot de passe | 7 jours |
| zupone-session | cookie HttpOnly | connexion unique entre les sites du groupe ZupOne | 30 jours |
| accessToken, refreshToken, driverToken | stockage local | maintenir la session connectée | jusqu'à la déconnexion |
| currentOrgId, currentDriverId, userEmail | stockage local | retrouver la boutique ou le compte actif | jusqu'à la déconnexion |
| Panier, adresse de livraison, adresses récentes | stockage local | conserver le panier et l'adresse entre deux visites | jusqu'à la commande ou au vidage |
| selectedTheme | stockage local | mémoriser le thème de la vitrine d'un commerçant | persistant |
| Cookies Stripe | cookie tiers | sécuriser le paiement et prévenir la fraude, uniquement lors du paiement | selon Stripe |

## Personnalisation des offres

Les offres de votre région et les restaurants suggérés ne reposent sur **aucun traceur** : ils sont calculés par nos serveurs à partir de votre région et, si vous avez un compte, de vos commandes passées. Voir la [politique de confidentialité](/confidentialite).

## Services tiers

L'affichage des cartes charge des tuiles OpenStreetMap et les suggestions d'adresse interrogent Photon (Komoot) : ces services reçoivent votre adresse IP, sans déposer de cookie de suivi.

## Les supprimer

La déconnexion efface les jetons de session. Vous pouvez supprimer à tout moment cookies et stockage local depuis les réglages de votre navigateur ; le site vous demandera alors de vous reconnecter.

## Évolution

Si des traceurs soumis à consentement (mesure d'audience, publicité) étaient ajoutés, un bandeau vous permettrait de les accepter ou de les refuser aussi facilement, avant tout dépôt. Voir aussi la [politique de confidentialité](/confidentialite).`,
  },

  accessibilite: {
    titre: "Déclaration d'accessibilité",
    contenu: `ZupEat s'engage à rendre ses services accessibles, conformément à la directive (UE) 2019/882 (acte européen sur l'accessibilité) et à l'article 47 de la loi n° 2005-102 du 11 février 2005.

## État de conformité

Le site et les applications sont **partiellement conformes** aux référentiels WCAG 2.1 niveau AA et RGAA 4. Un audit complet n'a pas encore été réalisé : les résultats seront publiés ici dès qu'il sera terminé.

## Contenus non accessibles

- certains éléments de la carte interactive (OpenStreetMap) ne sont pas utilisables au clavier ; l'adresse peut toujours être saisie dans un champ de texte ;
- des images fournies par les commerçants peuvent être dépourvues de description alternative.

## Nous contacter

Si vous ne parvenez pas à accéder à un contenu ou à un service, écrivez à [contact@zupeat.com](mailto:contact@zupeat.com) en décrivant le problème et l'outil utilisé : nous répondons sous 10 jours ouvrés et proposons une alternative.

## Voies de recours

Sans réponse satisfaisante, vous pouvez écrire au Défenseur des droits (formulaire en ligne sur [defenseurdesdroits.fr](https://formulaire.defenseurdesdroits.fr)) ou, en Belgique, saisir Unia.`,
  },
};
