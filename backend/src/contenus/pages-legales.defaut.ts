/**
 * Textes légaux de départ, en Markdown.
 *
 * Projets servis tant que la plateforme n'a publié aucune version depuis
 * l'espace superowner. Ces textes ne valent pas validation juridique : les
 * champs entre crochets et les pratiques réelles sont à vérifier avant vente.
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
    contenu: `**Projet à compléter avant toute ouverture commerciale.** L'identité de l'exploitant de ZupEat et des domaines exploités doit être vérifiée et publiée. Les activités ZupDrive font l'objet de documents distincts avant leur lancement.

## Éditeur

- Nom ou dénomination légale de l'exploitant : $raison_sociale
- Forme juridique, si applicable : $forme_juridique
- Adresse d'établissement : $adresse
- Numéro d'entreprise BCE : $numero_bce
- Numéro de TVA, si applicable : $numero_tva
- Courriel : $email — Téléphone : $telephone

## Hébergement

$hebergeur, $adresse_hebergeur. Les autres coordonnées de l'hébergeur sont à compléter si nécessaires.

## Rôle de ZupEat

ZupEat est une plateforme d'intermédiation. Les produits sont vendus par les commerçants partenaires, qui en sont seuls vendeurs et responsables ; chaque vitrine indique l'identité du commerçant concerné. ZupEat met en relation clients, commerçants et livreurs et encaisse les paiements pour le compte des commerçants.

## Propriété intellectuelle

La marque ZupEat, le site, son code et ses contenus propres sont protégés. Toute reproduction sans autorisation écrite est interdite. Les photos et descriptions de produits appartiennent aux commerçants qui les publient. Les fonds de carte proviennent d'OpenStreetMap (© contributeurs OpenStreetMap, licence ODbL).

## Signaler un contenu illicite

Conformément au règlement (UE) 2022/2065 (Digital Services Act), toute personne peut signaler un contenu qu'elle estime illicite (produit interdit, contrefaçon, avis frauduleux, etc.) à $email. Le signalement indique :

- l'adresse exacte de la page concernée ;
- les raisons pour lesquelles le contenu est illicite ;
- le nom et l'adresse électronique de l'auteur du signalement (sauf infractions relevant des articles 3 à 7 de la directive 2011/93/UE).

La procédure de réception, d'examen, de notification des décisions et de contestation des signalements doit être opérationnelle et documentée avant publication de cette page.

Point de contact pour les autorités et les utilisateurs : $email. Les langues de communication acceptées doivent être précisées.

## Médiation de la consommation

En cas de litige non résolu avec le service client, le consommateur peut consulter le [Service de Médiation pour le Consommateur](https://mediationconsommateur.be/) si celui-ci est compétent. Les coordonnées de contact de l'exploitant et les éventuelles autres entités de médiation compétentes sont à confirmer avant publication.`,
  },

  cgu: {
    titre: "Conditions générales d'utilisation",
    contenu: `**Projet de conditions à valider avant ouverture commerciale.** Les présentes conditions encadrent l'accès et l'usage de la plateforme ZupEat, exploitée par $raison_sociale (voir les [mentions légales](/mentions-legales)). L'acceptation des conditions est recueillie dans les parcours qui la requièrent.

## 1. Objet

ZupEat permet aux clients de commander auprès de commerces de proximité, en retrait ou en livraison, aux commerçants de gérer leur boutique en ligne et aux livreurs de réaliser des courses. Les ventes elles-mêmes relèvent des [conditions générales de vente](/cgv).

## 2. Compte

- La commande est possible sans compte ; le compte permet de suivre ses commandes et de retrouver ses paniers.
- Les informations fournies doivent être exactes et tenues à jour.
- L'utilisateur garde son mot de passe confidentiel et répond de l'usage de son compte.
- Il faut avoir 16 ans pour créer un compte, et 18 ans pour commander de l'alcool.
- Le compte peut être supprimé à tout moment selon le parcours prévu dans le compte ou sur demande à $email.

## 3. Comportements interdits

- passer de fausses commandes ou usurper l'identité d'autrui ;
- publier des contenus illicites, trompeurs, injurieux ou portant atteinte aux droits de tiers ;
- tenter d'accéder aux données d'autres utilisateurs ou de perturber le service ;
- extraire massivement les données du site par des moyens automatisés ;
- contourner la plateforme pour régler une commande passée via ZupEat.

Tout manquement peut entraîner la restriction, la suspension ou la fermeture du compte, après information de l'intéressé sauf urgence.

## 4. Avis et notes

Les notes attribuées aux livreurs reflètent l'expérience réelle de l'utilisateur. ZupEat peut retirer une note manifestement abusive. Les notes ne sont pas rémunérées.

## 4 bis. Classement des commerces

La liste « Recommandées » classe d'abord les commerces ouverts, puis ceux qui livrent à l'adresse choisie, puis selon leur note. L'utilisateur peut choisir un tri par note, délai et frais de livraison, ou distance lorsque son adresse le permet. La description des paramètres doit aussi être accessible directement auprès de la liste de résultats. Aucun placement payant n'est prévu dans le code actuel.

## 5. Disponibilité

ZupEat s'efforce de maintenir le service accessible mais ne garantit pas une disponibilité continue : des interruptions pour maintenance peuvent survenir, annoncées lorsque c'est possible.

## 6. Responsabilité

ZupEat répond du bon fonctionnement de la plateforme. Chaque commerçant répond des produits qu'il vend et des informations de sa vitrine (prix, allergènes, disponibilité).

## 7. Données personnelles

Voir la [politique de confidentialité](/confidentialite) et la page [cookies](/cookies).

## 8. Modification

Ces conditions peuvent évoluer. Les titulaires d'un compte sont prévenus de toute modification substantielle au moins 15 jours avant son entrée en vigueur.

## 9. Droit applicable

Le droit applicable et la juridiction compétente doivent être déterminés selon l'établissement de l'exploitant et les règles impératives protégeant le consommateur. Une solution amiable est recherchée en priorité ; voir les [mentions légales](/mentions-legales) pour les voies de médiation.`,
  },

  cgv: {
    titre: "Conditions générales de vente",
    contenu: `**Projet de conditions à valider avant ouverture commerciale.** Ces conditions s'appliquent à toute commande passée par un client auprès d'un commerçant via ZupEat. Le vendeur est le commerçant dont l'identité doit figurer sur la vitrine ; la répartition exacte des obligations entre ce vendeur et $raison_sociale doit être vérifiée. ZupEat agit en intermédiaire et encaisse le paiement pour le compte du vendeur lorsque ce mode est activé.

## 1. Commande

Le client compose son panier, choisit le retrait ou la livraison, et valide après avoir vu le récapitulatif : produits, frais de livraison, frais de service et total TTC. La commande est ferme une fois le paiement accepté ; le commerçant peut la refuser (rupture, fermeture, zone non desservie), auquel cas le client est intégralement remboursé.

## 2. Prix

Les prix sont affichés en euros TTC, fixés par chaque commerçant. S'y ajoutent, affichés avant validation :

- les frais de livraison, selon la zone de l'adresse ;
- les frais de service en vigueur, calculés et affichés dans le récapitulatif avant la commande ;
- le cas échéant, un minimum de commande propre au commerçant.

## 3. Paiement

Le paiement s'effectue par carte bancaire via notre prestataire Stripe. ZupEat ne stocke jamais les données de carte. Le débit intervient à la validation de la commande.

## 4. Retrait et livraison

Les délais et créneaux sont indicatifs. En livraison, le client doit être joignable à l'adresse indiquée ; une preuve de remise peut être recueillie par le livreur. Le suivi de la course est disponible en temps réel.

## 5. Annulation

Le client peut annuler sans frais tant que le commerçant n'a pas accepté la commande, dans le délai affiché. Au-delà, l'annulation n'est plus possible, la préparation ayant commencé.

## 6. Droit de rétractation

Le droit de rétractation de 14 jours s'applique aux ventes à distance lorsqu'aucune exception légale ne joue. Les denrées susceptibles de se détériorer ou de se périmer rapidement et les biens confectionnés selon les spécifications du client peuvent notamment relever d'une exception. Le vendeur doit informer le client de l'existence ou de l'absence du droit applicable au produit, des modalités d'exercice et, lorsque ce droit existe, lui fournir le formulaire type avant la commande. Les modalités concrètes de retour et le contact du vendeur sont à compléter.

## 7. Réclamations

Produit manquant, erroné ou non conforme : signalez-le depuis votre espace (support) ou à [Adresse électronique de contact], avec si possible une photo. La possibilité de signaler rapidement le problème ne limite pas les droits et délais légaux du consommateur. Un remboursement total ou partiel est accordé lorsque la réclamation est fondée. Les garanties légales applicables restent en vigueur.

## 8. Allergènes et alcool

Les informations sur les allergènes sont fournies par le commerçant ; en cas de doute, contactez-le avant de commander. La vente d'alcool est interdite aux mineurs : une pièce d'identité peut être demandée à la remise.

## 9. Litiges

Voir la médiation dans les [mentions légales](/mentions-legales). Le droit applicable est déterminé selon l'établissement du vendeur et les protections impératives du consommateur.`,
  },

  "conditions-commercants": {
    titre: "Conditions générales commerçants",
    contenu: `**Projet de conditions à valider avant ouverture commerciale.** Ces conditions lient $raison_sociale et tout professionnel qui ouvre une boutique sur la plateforme. Elles complètent les [CGU](/cgu).

## 1. Inscription

Le commerçant fournit un dossier exact et à jour (identité de l'entreprise, numéro BCE ou identifiant professionnel étranger équivalent, TVA le cas échéant, coordonnées bancaires, autorisations propres à son activité). ZupEat peut refuser ou suspendre une boutique dont le dossier est incomplet ou inexact.

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

Selon le champ d'application des règles DAC7 transposées dans le pays de déclaration, ZupEat collecte et transmet les informations requises relatives aux commerçants concernés et aux sommes perçues (identité, adresse, numéro d'identification fiscale, TVA le cas échéant, coordonnées du compte de paiement, nombre de transactions et montants par trimestre). La procédure de déclaration, les exceptions et les conséquences d'un dossier incomplet doivent être précisées avant publication.

## 5. Données des clients

Le commerçant n'utilise les données des clients que pour exécuter les commandes. Toute prospection commerciale suppose le consentement du client. Il agit en responsable de traitement pour ses propres usages et garantit leur conformité au RGPD.

## 6. Contenus

Le commerçant garantit détenir les droits sur les photos, logos et textes qu'il publie, et concède à ZupEat le droit de les afficher pour la durée de la relation.

## 7. Suspension et résiliation

Chaque partie peut résilier à tout moment avec un préavis de 30 jours. ZupEat peut suspendre sans préavis une boutique en cas de manquement grave (fraude, produits dangereux, plaintes répétées), en motivant sa décision conformément au règlement (UE) 2019/1150.

## 8. Classement

La liste « Recommandées » classe d'abord les commerces ouverts, puis ceux qui livrent à l'adresse choisie, puis selon leur note. Les autres tris proposés portent sur la note, le délai et les frais de livraison, ou la distance lorsque l'adresse le permet. Aucun classement payant n'est prévu dans le code actuel. Ces paramètres doivent être vérifiés après chaque évolution de l'algorithme et expliqués aussi aux consommateurs dans la liste de résultats.

## 9. Réclamations et droit applicable

Les réclamations passent par le support commerçant. Le droit applicable et la juridiction compétente doivent être précisés après identification de l'exploitant et examen des règles impératives applicables.`,
  },

  "conditions-livreurs": {
    titre: "Conditions générales livreurs",
    contenu: `Ces conditions sont un projet à valider par un avocat belge et identifient les engagements annoncés aux livreurs qui utilisent la plateforme ZupEat. Elles complètent les [CGU](/cgu). L'exploitant est $raison_sociale, $forme_juridique, établi à $adresse, inscrit à la BCE sous le numéro $numero_bce et identifié à la TVA sous le numéro $numero_tva.

## 1. Statut

Les parties entendent organiser une relation de prestation indépendante, sous réserve de la qualification résultant des conditions concrètes d'exécution et du droit applicable. Le livreur choisit ses périodes de connexion, peut se déconnecter, faire une pause, cesser d'utiliser la plateforme et travailler pour des tiers. Aucun nombre minimal de jours ou de courses n'est annoncé comme obligatoire. Chaque course est présentée comme une proposition distincte et requiert l'acceptation explicite du livreur. Un refus ou une absence de réponse ne constitue pas, à lui seul, un manquement et ne réduit pas l'accès aux autres offres.

## 2. Validation du dossier

Avant l'accès aux propositions, ZupEat demande un numéro BCE à tout candidat comme règle d'admissibilité de la plateforme. Le format est contrôlé automatiquement; un opérateur habilité vérifie ensuite le numéro dans le registre BCE et consigne sa décision avant l'activation. Cette règle de plateforme ne signifie pas que la loi impose nécessairement un numéro BCE à chaque personne, et le numéro ne détermine pas à lui seul la qualification de la relation. Les entreprises étrangères et les identifiants équivalents doivent être traités selon des règles à valider avant l'ouverture de ces marchés. Les autres contrôles portent sur l'identité, les informations fiscales nécessaires, les coordonnées de paiement, le véhicule, les permis et les assurances ou autorisations applicables. Les pièces ne sont accessibles qu'aux personnes habilitées pour ce contrôle.

## 3. Réalisation des courses

- avant sa décision, le livreur voit le montant proposé et les informations de distance et de lot disponibles dans l'application. Les distances, durées et montants marqués comme estimatifs ne constituent pas une garantie de durée ou de trajet ;
- un commerçant peut suggérer un livreur admissible, mais cette suggestion ne lui attribue pas la course. Seule l'acceptation explicite de l'offre l'engage ;
- le livreur organise les moyens et l'itinéraire, sous réserve des obligations légales, de sécurité et des informations nécessaires à la commande acceptée. Pour un lot de courses accepté en une seule offre, l'application calcule actuellement l'ordre des remises et le maintient pendant la tournée ; cette contrainte technique, sa nécessité et sa portée doivent être validées par un avocat belge avant publication ;
- une preuve de remise peut être demandée lorsqu'elle est nécessaire à la bonne exécution ou au traitement d'un litige ;
- la position peut être traitée lorsque le livreur choisit la disponibilité en ligne et pour le suivi d'une course acceptée. Elle n'est pas actualisée côté serveur pendant une pause sans course ni après la déconnexion ; les données de preuve et de litige suivent leurs finalités propres décrites dans la politique de confidentialité.

## 4. Rémunération

Le montant individuel affiché avant acceptation est celui proposé pour la mission et, après acceptation, est enregistré avec la course. Le détail du calcul, des compléments éventuels, des frais applicables et du calendrier de paiement doit être précisé dans l'espace livreur et les documents commerciaux applicables avant lancement. Les pourboires attribués au livreur sont identifiés séparément dans les relevés. Le livreur reste responsable des obligations fiscales et sociales qui lui incombent selon son statut. Les informations fiscales requises sont recueillies et déclarées selon les règles applicables, notamment DAC7 le cas échéant ; aucun identifiant fiscal français n'est présumé.

## 5. Notes

Les clients peuvent évaluer le résultat commercial d'une livraison. Les avis et plaintes contestées ne sont pas assimilés à des faits vérifiés. Toute restriction importante du compte doit indiquer son motif et les moyens de la contester ; les décisions importantes appellent un examen humain approprié lorsque la loi l'exige. Les mécanismes précis de contestation et de révision doivent être opérationnels avant d'annoncer leur disponibilité.

## 6. Assurance et sécurité

Le livreur fournit les attestations légalement requises pour son statut et son véhicule. **Au 31 octobre 2026, l'exploitant confirme ne disposer d'aucune police d'assurance accident de plateforme. Aucune couverture de plateforme n'est donc fournie par ZupOne.** L'article 19 de la loi belge du 3 octobre 2022 prévoit une assurance pour les collaborateurs indépendants des plateformes entrant dans son champ. Son entrée en vigueur, initialement prévue au 1er janvier 2026 par l'arrêté royal du 12 août 2024, a été reportée au 1er janvier 2028 par l'arrêté royal du 19 décembre 2025. Le dispositif vise les dommages corporels résultant d'accidents lors des activités rémunérées via la plateforme et des trajets associés. Le champ d'application et les obligations transitoires doivent être confirmés avec un assureur ou un conseil belge avant activation des livraisons. Le livreur peut signaler un incident via l'application.

## 7. Fin de la relation

Le livreur peut cesser d'utiliser la plateforme et demander la clôture de son compte, sous réserve des obligations de conservation applicables. Toute suspension ou fin d'accès doit reposer sur un motif objectif lié à l'admissibilité, à la sécurité, à la fraude ou à un manquement grave ; elle ne peut être fondée sur un refus de course, l'inactivité ou l'utilisation de plateformes concurrentes. La procédure de notification, de contestation et de réexamen doit être définie avant publication.`,
  },

  confidentialite: {
    titre: "Politique de confidentialité",
    contenu: `**Projet de notice à compléter avant toute collecte commerciale.** $raison_sociale (ZupEat) est responsable des traitements décrits ci-dessous au titre du règlement (UE) 2016/679 (RGPD). Le rôle de chaque commerçant dans les traitements partagés ou propres doit être documenté.

## Données traitées et finalités

| Finalité | Données | Base légale | Durée |
| --- | --- | --- | --- |
| Gestion du compte et admissibilité Livreur | nom, e-mail, téléphone, mot de passe haché, numéro BCE chiffré et état/date du contrôle | Base légale et durée à documenter par finalité avant publication; vérification du registre BCE et accès réservé aux personnes habilitées | À définir après revue des obligations et du cycle de vie du compte |
| Commandes et livraison | produits, adresse, coordonnées nécessaires, instructions, historique, position en cours de livraison et preuves attachées à la course | Base légale et durée par type de donnée à confirmer | À définir; les coordonnées enregistrées avec les commandes/preuves ne sont pas purgées par l'arrêt de la localisation du profil |
| Paiement | montant, statut ; la carte est traitée par Stripe seul | contrat | 10 ans pour les pièces comptables |
| Position de disponibilité | dernière position du profil quand le Livreur choisit d'être en ligne; aucune actualisation pendant pause ou hors ligne sans course | Finalité, base légale, destinataires et nécessité à documenter; pas de consentement présumé | Le point de profil est effacé lors d'une pause/déconnexion sans course; la durée des positions attachées aux courses reste à définir |
| Dossier Livreur | justificatifs nécessaires, numéro BCE chiffré, coordonnées de paiement | Base légale et durée à documenter par catégorie; contrôle BCE réservé aux opérateurs habilités | À définir après revue juridique; le numéro BCE n'est pas présenté comme preuve suffisante d'indépendance |
| Preuve d'acceptation des conditions | e-mail, documents et versions acceptés, adresse IP, navigateur, date | obligation légale / intérêt légitime | 5 ans après la fin de la relation |
| Support et réclamations | messages, pièces jointes | intérêt légitime | 3 ans après clôture |
| Sécurité et prévention de la fraude | journaux de connexion, adresse IP | obligation légale / intérêt légitime | 1 an |
| Notifications | abonnement aux notifications push | consentement | jusqu'au retrait du consentement |

## Destinataires

- le commerçant et, en livraison, le livreur, pour ce qui est nécessaire à la commande ;
- Stripe (paiement) ;
- notre hébergeur ($hebergeur) ;
- le service de géocodage Photon (Komoot) pour les suggestions d'adresse, et OpenStreetMap pour l'affichage des cartes ;
- les autorités, sur réquisition légale.

Nous ne vendons aucune donnée. Les éventuels transferts hors de l'Espace économique européen, leurs pays de destination, garanties et moyens d'en obtenir copie restent à documenter à partir des contrats et paramètres réellement utilisés.

## Vos droits

Vous disposez, selon les conditions du RGPD, des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité. Lorsque le traitement repose sur votre consentement, vous pouvez le retirer. Contactez $email. Les coordonnées du responsable, celles du délégué à la protection des données s'il est requis, et le processus de réponse doivent être complétés avant publication. Vous pouvez introduire une plainte auprès de l'[Autorité de protection des données belge](https://www.autoriteprotectiondonnees.be/).

## Sécurité

Mots de passe hachés, échanges chiffrés (HTTPS), accès restreint par rôle et journalisé, sauvegardes régulières.

## Cookies

Voir la page [cookies et traceurs](/cookies).`,
  },

  cookies: {
    titre: "Cookies et traceurs",
    contenu: `**Projet de notice à vérifier sur le site déployé.** Le code connu ne prévoit pas de cookie publicitaire ni de mesure d'audience tierce. Les cookies et autres informations stockées sur l'appareil doivent être inventoriés en production. Un consentement préalable est requis pour les traceurs qui ne sont pas strictement nécessaires au service demandé.

## Traceurs utilisés

| Nom | Type | Rôle | Durée |
| --- | --- | --- | --- |
| Langue et pays choisis | cookies | mémoriser les préférences choisies | jusqu'à 1 an |
| Session et connexion centralisée | cookies HttpOnly | maintenir la connexion demandée | selon la durée de session configurée |
| Panier et adresse de livraison récente | stockage local | retrouver les choix du client | jusqu'à effacement par le client ou purge applicative |
| Boutique active, thème et préférences d'interface | stockage local | retrouver les choix de l'utilisateur | jusqu'à effacement par le client ou purge applicative |
| Cookies Stripe, si paiement en ligne | cookies tiers | sécurité et prévention de la fraude pendant le paiement | selon la documentation et la configuration du prestataire |

## Services tiers

L'affichage des cartes charge des tuiles OpenStreetMap et les suggestions d'adresse interrogent Photon (Komoot) : ces services reçoivent votre adresse IP, sans déposer de cookie de suivi.

## Les supprimer

La déconnexion révoque la session de connexion. Vous pouvez supprimer les cookies et le stockage local depuis les réglages de votre navigateur ; le site pourra alors vous demander de vous reconnecter ou de ressaisir vos préférences. Les durées et les catégories de traceurs doivent être vérifiées sur chaque domaine exploité.

## Évolution

Si des traceurs soumis à consentement (mesure d'audience, publicité) étaient ajoutés, un bandeau vous permettrait de les accepter ou de les refuser aussi facilement, avant tout dépôt. Voir aussi la [politique de confidentialité](/confidentialite).`,
  },

  accessibilite: {
    titre: "Déclaration d'accessibilité",
    contenu: `**Projet de déclaration à compléter après audit.** ZupEat vise l'accessibilité de ses services de commerce électronique conformément aux exigences applicables en Belgique issues de la directive (UE) 2019/882. Le champ exact et les éventuelles exceptions doivent être vérifiés selon l'exploitant et le service.

## État de conformité

Aucun niveau de conformité ne peut être attesté sans audit complet du site et des applications concernés. Le périmètre, la méthode, les résultats et les mesures correctives seront publiés ici après vérification.

## Contenus non accessibles

- certains éléments de la carte interactive (OpenStreetMap) ne sont pas utilisables au clavier ; l'adresse peut toujours être saisie dans un champ de texte ;
- des images fournies par les commerçants peuvent être dépourvues de description alternative.

## Nous contacter

Si vous ne parvenez pas à accéder à un contenu ou à un service, écrivez à $email en décrivant le problème et l'outil utilisé. Le délai de réponse et la solution proposée doivent être précisés selon les moyens réellement disponibles.

## Voies de recours

Les voies de signalement et l'autorité compétente doivent être précisées pour chaque service et pays effectivement exploité.`,
  },
};

