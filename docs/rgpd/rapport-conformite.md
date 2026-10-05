# Rapport de phase 6 — 5 octobre 2026

## Conclusion de conformité

**L'ouverture publique n'est pas validée.** Ce rapport décrit des modifications locales et leurs preuves de test ; aucun déploiement ni changement d'un système de production n'a été effectué. L'environnement de travail n'a fourni ni secrets de production, ni accès hébergeur, ni contrats de sous-traitance ou décisions DPO. Ces absences empêchent d'attester une conformité de bout en bout.

Les protections applicatives implémentées sont : chiffrement AES-GCM des champs critiques et fichiers/sauvegardes ; antivirus obligatoire hors tests ; stockage privé isolé ; réautorisation de lecture ; audit sensible signé ; export personnel réauthentifié ; effacement et pseudonymisation ; purge automatique avec gels ciblés ; restauration empêchant la réintroduction de profils effacés ; minimisation de copies et logs. Les politiques et procédures accompagnent le code.

## Constats et remédiations

| Risque initial | Gravité | Remédiation livrée | Preuve / limite |
|---|---|---|---|
| IBAN, téléphones, adresses, numéros de licence et snapshots critiques lisibles en base | P1 | Extension Prisma AES-256-GCM, trousseau versionné et CLI de migration/rotation | Tests de cryptographie et lectures brutes SQL ; migration de la base réelle restant à effectuer |
| Pièces privées en clair dans uploads et stockage externe de garanties variables | P1 | Chiffrement du fichier ; volume séparé ; Cloudinary réservé aux nouveaux visuels publics ; migration de l'existant | Autorisation serveur et tests fichiers ; suppression externe à obtenir |
| Absence d'antivirus, extensions non contrôlées | P1 | ClamAV INSTREAM, refus fermé sur panne ; MIME/signature/extension/taille/parties | Tests de protocole et formats ; vrai moteur et mises à jour à valider sur infrastructure |
| Réutilisation de lien externe ou pièce d'un autre dossier | P1 | Nouveaux dépôts externes refusés ; rattachement privé contrôlé ; nouvelle adresse signée liée à session/acteur | Les liens signés restent des capacités temporaires partageables ; TLS, referrer et durée limitée indispensables |
| Session/permissions révoquées après émission d'un lien | P1 | Signature liée à user/session ; état de session et autorisation relus au téléchargement | Révocation testée ; caches des groupes de permissions à évaluer multi-instance |
| Suppression client laissant nom, téléphone/adresse et suivi dans commandes | P1 | Suppression des coordonnées, jetons et préférences ; historiques détachés/pseudonymisés | Tests SQL ; anciennes factures et prestataires relèvent d'une exception limitée à faire approuver |
| Compte chauffeur ignoré lors d'une suppression exclusivement client | P1 | Identité partagée prise en compte, autre espace conservé explicitement ; effacement total distinct | Tests multi-rôles nécessaires sur appareils réels |
| Suppression livreur non finalisée après dernier paiement | P1 | Finalisation périodique, protection des créances et alerte après 30 j | Rapprochement bancaire réel et litiges à traiter par opérateur |
| Pas de durée globale ni purge des données sensibles | P1 | Tâche horaire surveillée, verrou distribué, purges et gels légaux | Durées nationales/sectorielles et capacité à grande échelle à approuver |
| Audit administratif effacé avec l'utilisateur, absence de trace de lecture | P1 | Journal RGPD autonome, HMAC, acteur pseudonymisé, trigger anti-update/delete précoce/truncate ; trace avant délivrance | SQL propriétaire peut désactiver trigger : rôle runtime limité et stockage WORM requis |
| Sauvegardes JSON et gzip en clair, restauration d'anciens profils | P1 | AES pour sauvegardes applicatives, flux age pour exploitation, refus de restauration antérieure à effacement ; procédure isolée | Planification, hors site, récupération clés et dumps anciens à contrôler |
| Copies client/commande inutiles dans archive commerçant | P2 | Copies retirées des nouveaux snapshots et migration/purge des anciennes | Restauration catalogue conservée ; historique comptable d'origine conservé |
| Collecte excessive dans snapshot facture | P2 | Téléphone et e-mail retirés des nouvelles factures | Revue des pièces anciennes nécessaire sans altération juridique arbitraire |
| Champs personnels de recherche et géographiques lisibles par SQL | P1 infrastructure / P2 applicatif | Exigence de chiffrement volume/WAL et accès limités ; rétention courte ; inventaire exhaustif | Chiffrement volume non attesté ; index aveugles restent à réaliser si menace SQL incluse |
| Données de casier/médecine/associés sans fondement juridique démontré | P1 | Cartographie et signalement articles 9/10, finalité régionale identifiée | Aucun fondement inventé : DPO/conseil doit valider ou arrêter cette collecte avant ouverture |
| Export utilisateur absent | P1 | JSON, ZIP avec pièces autorisées et PDF ; session+mot de passe ; pas de fichier public | Limites explicites de volume ; pièces externes/manquantes signalées |

## Priorités avant ouverture

**P1 — bloquantes :**

1. Migrer la base/fichiers/sauvegardes réels, exécuter `privacy:check`, supprimer copies externes et obtenir preuve de nettoyage ; répéter les parcours entre comptes distincts.
2. Attester chiffrement disques/WAL/snapshots et séparation des secrets ; faire un exercice de récupération sur infrastructure isolée.
3. Vérifier ClamAV réel, EICAR, arrêt du scanner, mises à jour et surveillance.
4. Séparer compte PostgreSQL runtime et migration ; MFA/admin nominatif ; exporter audit vers stockage immuable ; appliquer logrotate et revue d'habilitations.
5. Valider registre des traitements, fondements articles 6/9/10, AIPD de géolocalisation/suivi, durées comptables et sectorielles, clauses article 28/transferts, notices et contact DPO.
6. Planifier sauvegardes chiffrées hors site, tester restauration avec effacements et rapprochement bancaire ; terminer les demandes et litiges en attente.
7. Vérifier effacement auprès des sous-traitants, des caches web/mobile et des sauvegardes OS ; tester l'export documentaire sur le parc réel.

**P2 — importantes :** index aveugles/chiffrement applicatif des clés de recherche si requis ; gestionnaire KMS natif ; historique HMAC multi-clé vérifiable automatiquement ; export asynchrone pour gros comptes et interface web/mobile ; alertes de backlog documentaire ; registre de consentement marketing, purge invitations/notifications/webhooks, revue des champs peu utilisés ; CDR PDF et traitement d'images contre polyglottes ; audit de concurrence effacement/nouvelles commandes.

**P3 — amélioration continue :** indicateurs de minimisation et durées effectives ; exercices d'incident trimestriels ; tests appareils et restauration récurrents ; revue fournisseurs/dépendances ; documentation DPO, formations et audit indépendant annuel.

Chaque P1 doit avoir un responsable, une date et une preuve de clôture dans le registre de lancement. Ne pas transformer une variable `true` en approbation juridique ou en preuve de configuration.

## Validation reproductible

Les tests d'intégration RGPD sont opt-in et refusent une base dont le nom ne contient pas `test`. Fournir les variables de test de `.env.test`, adapter `DATABASE_URL`, appliquer les migrations sur une base **dédiée**, puis :

```sh
cd backend
NODE_ENV=test npm test -- --runTestsByPath \
  src/modules/privacy/__tests__/crypto.test.ts \
  src/modules/files/__tests__/file-upload.middleware.test.ts \
  src/modules/files/__tests__/fichiers-prives.test.ts \
  src/modules/files/__tests__/antivirus.test.ts

DOTENV_CONFIG_PATH=.env.test NODE_ENV=test PRIVACY_INTEGRATION=true \
  node -r dotenv/config node_modules/jest/bin/jest.js --runInBand \
  --detectOpenHandles --runTestsByPath src/modules/privacy/__tests__/privacy.integration.test.ts

npx tsc --noEmit
node --import tsx scripts/privacy-inventory.ts
```

Les tests d'intégration nécessitent PostgreSQL et `unzip`. Ils inspectent des lignes avec un client brut, exercent les transactions et relations, contrôlent fichiers chiffrés, intégrité ZIP, réauthentification/export, triggers de journal, purge, effacement et interdiction de restauration. Les tests AV simulent le protocole du moteur ; ils ne prétendent pas scanner avec les signatures ClamAV de production. Les données créées sont fictives ; aucun message réel n'est envoyé.

Les résultats finaux de l'exécution locale sont consignés dans [validation locale](validation.md).
