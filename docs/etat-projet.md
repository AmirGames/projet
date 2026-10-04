# État du projet et travail restant

Mis à jour le **4 octobre 2026**. Ce document rassemble l'état connu du dépôt,
les résultats consignés dans les audits et les confirmations de l'opérateur.
Cette mise à jour documentaire n'a pas relancé les suites métier/API/navigateur
ni interrogé le VPS. Les contrôles locaux de documentation et mobiles sont
consignés en fin de fichier.
Un déploiement annoncé ne prouve pas à lui seul le commit actif du serveur.

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
  La présentation publique l'annonce encore « Bientôt disponible » ; le
  paiement en ligne des courses n'est pas inclus dans cette V1.
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
  configuration EAS et push, essais sur appareils réels, puis soumission.
  Voir [la préparation de l'application livreur](../mobile/apps/delivery/PUBLICATION.md).

## Développements complémentaires ou reportés

- **Commandes d'entraînement** exclues des statistiques et des reversements.
  Le commerce de démonstration existant refuse les commandes ; il ne remplace
  pas ce mode d'entraînement. Un paiement Stripe TEST ne constitue pas non plus
  ce mode métier.
- **ZupDrive V2** : paiement en ligne et règles de facturation des courses,
  une fois définis l'émetteur de la facture, la TVA et la commission.
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

## Contrôles de cette mise à jour documentaire

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
