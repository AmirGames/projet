# État du projet et travail restant

Mis à jour le **4 octobre 2026**. Ce document rassemble l'état connu du dépôt,
les résultats consignés dans les audits et les confirmations de l'opérateur.
Cette mise à jour documentaire n'a pas relancé les suites métier/API/navigateur
ni interrogé le VPS. Les contrôles locaux de documentation et mobiles sont
consignés en fin de fichier.
Un déploiement annoncé ne prouve pas à lui seul le commit actif du serveur.

## Bloc prioritaire — Phase 0 sécurité

Le 5 octobre 2026, les correctifs locaux de la Phase 0 ont été ajoutés.
**La phase n'est pas validée** : 42 contrôles locaux avec dépendances simulées
passent, mais les suites complètes et le build sont bloqués par l'absence des
dépendances. L'énumération lors de l'inscription et la révocation des liens
signés restent ouvertes. Aucune nouvelle fonctionnalité métier ni ouverture
à grande échelle avant validation complète. Voir
[les corrections, preuves et blocages](phase-0-securite.md).

## Ce qui existe

- **ZupEat** : catalogue, commande avec ou sans compte, paiement Stripe,
  remboursement, préparation, attribution aux livreurs, suivi et preuve de
  livraison, pourboires, reversements hebdomadaires et export SEPA.
- **Administration ZupOne** : équipe et permissions par plateforme,
  validation des dossiers, support, facturation, pages légales versionnées,
  journaux et surveillance.
- **Vitrine ZupOne** : page du groupe dans `frontend/app/zupone/page.tsx`.
- **ZupDrive V1** : dossiers chauffeurs et sociétés, véhicules et invitations,
  validation des pièces, tarifs régionaux, devis signés, attribution et suivi
  des courses, annulation et notes. Voir [le périmètre ZupDrive](zupdrive.md).
  La présentation publique l'annonce encore « Bientôt disponible ». Côté API,
  le paiement en ligne des courses est branché (webhook Stripe, versement du
  chauffeur) et les routes d'administration, de support, de conformité et de
  supervision sont montées : voir [`zupdrive-api-admin.md`](zupdrive-api-admin.md).
  Le formulaire de paiement est sur la page de suivi d'un trajet
  (`/trajet/[id]`) ; il reste désactivé tant que
  `ZUPDRIVE_PAIEMENT_OBLIGATOIRE` vaut `false`.
- **Applications mobiles** : client, commerçant et livreur écrits dans
  `mobile/apps/`. Leur publication dans les stores reste à réaliser. Une
  application d'administration existe aussi dans `mobile/apps/admin/`.

## Déploiement et validations acquises

Le site est **déployé sur un VPS**, avec l'API à `https://api.zupeat.com`.
L'infrastructure du dépôt utilise Docker Compose, Caddy, PostgreSQL et Redis.
Le déploiement et les correctifs de surveillance ont été confirmés par
l'opérateur. Voir [le guide d'exploitation](../DEPLOIEMENT-SCALEWAY.md).

| Périmètre | Résultat consigné | Limite de la preuve |
|---|---|---|
| Support et organisations sur le VPS | **67/67**, après déploiement du correctif | Audit HTTP ciblé avec deux comptes temporaires, pas un pentest complet |
| Invitations ZupDrive et refus administratifs sur le VPS | **12/12** | Compte ordinaire temporaire ; aucune course ni mutation administrative |
| Sondes Socket.IO et paiements sur le VPS | **10/10** après le déploiement annoncé | Refus et disponibilité ; ne couvrent pas les parcours authentifiés complets |
| Stripe TEST et PostgreSQL réels, en local isolé | **33/33** | Paiements, remboursements, concurrence, rejeu signé et rollback ; pas le formulaire de commande complet |
| Paiement Stripe TEST sur le VPS, le 4 octobre | Paiement réussi, webhook `payment_intent.succeeded` reçu et rejoué sans doublon visible côté client ou commerçant | Validation manuelle transmise par l'opérateur ; pas de contrôle SQL de tous les effets |

Pour le paiement TEST sur le VPS, le détail transmis est cohérent : articles
30,00 €, livraison 2,49 €, frais de service 0,25 €, soit 32,74 € pour la
commande, plus 3,00 € de pourboire, soit **35,74 € encaissés par Stripe**.
Le remboursement de cette commande sur le VPS reste à vérifier. Le mode LIVE
attend la validation du compte Stripe et sa propre configuration.

Les sources détaillées sont les audits [production](audit-production-2026-10-03.md),
[livreurs](audit-drivers-2026-10-03.md),
[ZupDrive](audit-zupdrive-2026-10-03.md),
[administration](audit-admin-2026-10-03.md),
[Socket.IO](audit-socket-2026-10-03.md) et
[paiements](audit-paiements-webhooks-2026-10-03.md).
Leurs sections initiales décrivent l'état au moment de chaque audit ; les
confirmations ultérieures et ce document donnent le suivi actuel.

## Priorités avant l'ouverture aux clients

- [ ] **Remboursement Stripe TEST sur le VPS** : montant de la commande et
  pourboire, réception de `charge.refunded`, état affiché et rejeu sans second
  remboursement. Les scénarios locaux sont déjà validés.
- [ ] **Paiement LIVE**, après validation du compte Stripe : configurer les
  clés et le secret du webhook LIVE, puis vérifier paiement, état de commande
  et remboursement d'un faible montant.
- [ ] **Commande complète en conditions réelles** : client, commerçant,
  livreur, remise avec code ou photo ; refus, client absent, perte de réseau,
  téléphone verrouillé et tournée de plusieurs courses.
- [ ] **Accès authentifiés sur le déploiement** : deux comptes distincts pour
  les livreurs, ZupDrive et les salons Socket.IO ; retrait de droits et
  révocation de session. Compléter les scénarios de concurrence livreurs
  contre PostgreSQL réel, notamment la capacité de tournée.
- [ ] **Reversements et SEPA** : vérifier les relevés des commerçants et des
  livreurs, commissions, pourboires, report de solde et confirmation de
  versement sans double paiement, sur des données de test dédiées.
- [ ] **Pages légales publiées** : contrôler les versions en administration
  et remplacer les champs entre crochets encore présents dans les textes
  par défaut. La publication effective n'a pas été vérifiée lors de cette
  mise à jour.
- [ ] **Cartes et itinéraires** : préparer un service adapté à l'usage public
  pour remplacer les serveurs de démonstration/publics utilisés actuellement.
- [ ] **Applications mobiles** : icônes définitives, comptes des stores,
  configuration Firebase/push du livreur (accès EAS confirmé),
  essais sur appareils réels, puis soumission.
  Voir [la préparation de l'application livreur](../mobile/apps/delivery/PUBLICATION.md).

## Développements complémentaires ou reportés

- **Commandes d'entraînement** exclues des statistiques et des reversements.
  Le commerce de démonstration existant refuse les commandes ; il ne remplace
  pas ce mode d'entraînement. Un paiement Stripe TEST ne constitue pas non plus
  ce mode métier.
- **ZupDrive V2** : activer le paiement obligatoire après vérification sur le VPS avec Stripe, essai de l'app mobile passager sur téléphone avec une carte Stripe de test (écrans, formulaire de carte et nettoyage des écrans hérités de ZupEat, adresses favorites, SOS et chat faits), règles de
  facturation (émetteur de la facture, TVA), frais d'annulation éventuels
  (le remboursement d'une course non aboutie est total et automatique), et tables sans code à supprimer par migration
  (voir [`zupdrive-api-admin.md`](zupdrive-api-admin.md#routeurs-supprimés)).
- **Notifications fiables après interruption** : compléter les effets après
  paiement par une outbox transactionnelle ou un mécanisme persistant.
  Les webhooks sortants disposent déjà de relances en base ; cela ne garantit
  pas la livraison de toutes les notifications de commande.
- **Suivi des erreurs et stockage externe des images** : évaluer et configurer
  selon les besoins. Le code contient une intégration Cloudinary optionnelle ;
  sa configuration sur le VPS n'est pas attestée ici. `SENTRY_DSN` existe dans
  la configuration, sans preuve de remontée d'erreurs opérationnelle.
- **Tests de charge et plusieurs instances** : mesurer le coût des contrôles
  Socket.IO, vérifier Redis et l'invalidation des caches de permissions.
- **Notes dans l'attribution** : le dispatch départage les livreurs à la
  distance ; l'utilisation de leurs notes est un chantier complémentaire.
- **Stock par ingrédient** : volontairement reporté au profit du bouton
  disponible/épuisé.

## Comment maintenir cet état

Pour chaque validation, noter la date, le périmètre, l'environnement, le commit
s'il est attesté, le résultat et les limites. Les nombres de contrôles des
anciens passages restent des résultats datés, jamais une garantie pour tout
le dépôt actuel. Ne pas marquer une case terminée sur la seule présence du code.

Les suites générales de vérification réinitialisent leur base : les exécuter
sur une **base de test dédiée**, jamais sur la base du VPS en exploitation.
Les sondes ciblées de `backend/scripts/security/` ont leurs propres prérequis
et effets, décrits dans les audits correspondants.

## Contrôles de la mise à jour documentaire initiale

Le 4 octobre 2026, les liens locaux et les blocs de code des documents
modifiés ont été vérifiés ; `git diff --check` ne signale pas d'erreur.
Aucun code applicatif n'a été modifié.

Les règles des dossiers mobiles demandent lint et contrôle TypeScript :

- **Commerçant** : contrôle TypeScript réussi.
- **Livreur** : contrôle TypeScript en échec dans l'installation locale,
  car `expo-speech` est déclaré dans `package.json` mais absent des modules
  installés ; cela entraîne aussi une erreur de type dans `lib/voice.ts`.
- **Lint commerçant et livreur** : aucune configuration ESLint trouvée ;
  l'initialisation automatique par Expo échoue avec une erreur réseau
  `EACCES`. Le lint n'est donc pas validé.

Ces limites concernent l'environnement local et le code existant ; elles
ne sont pas une preuve d'échec de l'application déployée. Les dépendances et
la configuration de lint devront être préparées avant de valider les builds
mobiles. Aucun paquet n'a été installé pour cette mise à jour.

## Préparation mobile livreur — 4 octobre 2026

Après la mise à jour documentaire, la préparation de l'application livreur
a commencé. Les échecs locaux ci-dessus pour ce dossier ont été corrigés :
installation de `expo-speech`, ajout d'`expo-dev-client`, configuration ESLint
et corrections des hooks React. Les dépendances sont alignées sur Expo SDK 57.

- **TypeScript livreur** : réussi.
- **Lint livreur** : 0 erreur, 30 avertissements conservés et documentés.
- **Expo Doctor** : 21/21 contrôles réussis.
- **Export JavaScript Android** : réussi.
- **APK Android de test** : compilation réussie, ARM64, Android 10 minimum ;
  signature et présence de l'adresse VPS dans le JavaScript vérifiées.
  Reconstruit avec le logo bleu « Z Delivery ZupEat » choisi par l'opérateur ;
  icône inspectée et présence dans l'APK vérifiée.
- **Profils EAS** : development, preview et production pointent vers le VPS.
- **Firebase Android** : projet `zupeat-a1e82` créé avec accord de l'opérateur,
  application livreur enregistrée et API FCM V1 activée. Accès à
  `@zupone/zupeat-delivery` confirmé et clé FCM V1 attribuée. Le fichier
  Android fourni est intégré à `app.json` et au projet Android généré.
  Nouvel APK compilé avec Firebase : ressources du bon projet et signature
  vérifiées. L'essai de l'APK précédent sur son Android signale
  « Inactives » et une instance Firebase non initialisée ; les alertes ne
  fonctionnaient qu'au retour dans l'application. La configuration Firebase/FCM
  et le nouveau build sont prêts. L'opérateur confirme ensuite la réception
  d'une push ; l'affichage d'une fenêtre et la sonnerie hors application
  manquent encore dans cette première version Firebase.
- **Alertes livreur 1.0.1** : module Expo local Android pour « Nouvelle course »
  au-dessus des autres applications et sur le verrouillage, après autorisation
  explicite. Option de sonnerie avec le volume des alarmes en silencieux ;
  démonstration différée de 5 s, sans action réelle. Les propositions sont
  relues sur l'API authentifiée avant affichage, avec expiration et réponse
  par les endpoints existants. Les deux options sont désactivées par défaut ;
  aucun volume système ni règle « Ne pas déranger » n'est changé.
  Tests du payload, des propositions expirées/étrangères et des lots : 4/4.
  Correctif serveur : signal FCM de données pour réveiller Android, en plus
  de la notification visible compatible avec les anciennes versions ; 13/13
  tests ciblés, TypeScript et compilation backend réussis, sans migration.
  Correctif appliqué au VPS par SSH ; fichier notifier et source de l'image
  comparés au correctif local. API saine et `/health` répond `status: ok`.
  La source et l'image précédentes sont conservées pour un retour éventuel.
  L'affichage, le réveil et les actions restent à valider sur le téléphone.
- **Présentation livreur 1.0.2** : la fenêtre Android reprend la carte sombre
  et la fiche de proposition orange de l'application, avec montant garanti,
  trajet, adresses, arrêts et bouton d'acceptation avec délai. Leaflet embarqué,
  conservation des points de livraison obfusqués, actions visibles sur petits
  écrans. Rendu vérifié à 390 × 780 et 320 × 568 (lot et adresses longues),
  tests des alertes 6/6, TypeScript et compilation Android réussis, lint sans
  erreur avec 30 avertissements existants. APK ARM64 code 3 signé et comparé
  aux ressources sources ; essai sur téléphone encore nécessaire. Le correctif
  serveur déjà déployé suffit, sans nouveau déploiement.
- **Appareils réels** : l'opérateur dispose d'un Android, aucun téléphone
  connecté pendant la préparation ; installation, GPS, curseur de remise,
  notifications et parcours hors connexion restent à essayer.

Voir [le compte rendu du livreur](../mobile/apps/delivery/VALIDATION.md)
pour la compilation native et les essais à réaliser. Ces corrections ne
valident ni les autres applications mobiles ni les parcours du VPS.
