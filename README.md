# Zupone - Groupe de Solutions pour la Livraison et la Restauration

> **A03 (13 octobre 2026) — Sécurité des commandes :** [correctifs d'autorisation et vérifications restantes](docs/A03-SECURITE-COMMANDES.md). Non testé / non déployé à ce stade.


> **A02 — Sécurité (investigation en cours, 13 octobre 2026) :** [revue des autorisations et scénarios de régression](docs/SECURITE-A02-2026-10-13.md). Les risques signalés ne sont pas des vulnérabilités confirmées ; aucune correction ni exécution de test revendiquée.


> **Audit A01 (13 octobre 2026) :** [baseline et limites des preuves](docs/audit-rea-ubereats.md). Les validations CI documentées ne prouvent pas un déploiement ni un parcours réel complet. Priorité : A02 puis A03.

## Audit des Livreurs en Belgique (22 octobre 2026)

L'audit initial, les huit critères belges, les corrections locales et les limites
de validation sont consignés dans [le rapport Livreurs](docs/audits/AUDIT-LIVREURS-INDEPENDANTS-2026.md).
La [matrice juridique](docs/legal/MATRICE-REQUALIFICATION.md), la
[géolocalisation RGPD](docs/legal/RGPD-GEOLOCALISATION-LIVREURS.md), la
[gestion algorithmique](docs/legal/GESTION-ALGORITHMIQUE-LIVREURS.md), la
[proposition d'architecture de remplacement](docs/legal/ARCHITECTURE-REMPLACEMENT-LIVREUR.md) et les
[scénarios de test](docs/testing/TESTS-CONFORMITE-LIVREURS.md) complètent ce
travail. Ces changements ne certifient pas la qualification de la relation et
ne sont pas déployés.


## Étape 16 — Décision de recette pilote A16 (12 octobre 2026)

Le code A16 est intégré par la [PR #222](https://github.com/AmirGames/projet/pull/222)
au commit `6439e36a51c6262b4781937c217a4063df6a90db`. La CI du head
`3085ff4dc09974fc99d6c7361cff79fbe67dff15` a réussi 11/11 jobs
([run 38287957646](https://github.com/AmirGames/projet/actions/runs/38287957646)),
dont migrations sur base vide et E2E avec Stripe désactivé. La décision est
**bloquée pour démarrer la recette utilisateur** : aucun SHA d'environnement,
base représentative, Stripe TEST/3DS externe ou appareil n'est attesté.
Le périmètre proposé est ZupEat fermé ; **ZupDrive est explicitement exclu**.
Voir le [compte rendu A16, la matrice A01–A16 et les prochaines preuves](docs/RECETTE-PILOTE-A16-2026-10-12.md).
La CI ne vaut ni validation serveur ni ouverture publique.

## Rapports A15

Les API de rapports appliquent une période par défaut de 90 jours, une période
maximale de 366 jours et une pagination bornée. Les agrégats sont calculés dans
PostgreSQL; les revenus livreurs n'hydratent plus tout l'historique. Contrats,
limites et protocole de charge : [guide A15](docs/RAPPORTS-A15.md). Les mesures
sur une base représentative et la validation en exploitation restent à faire.

## Étape 13 — A12 : audit et correction des dépendances (12 octobre 2026)

Le lockfile backend embarquait quatre alertes de production dans la chaîne du
CLI Prisma. Deux overrides compatibles corrigent `mysql2` et `deepmerge-ts`
sans modifier Prisma 7.10.0. L’audit backend `--omit=dev` est maintenant à
zéro; les lockfiles web/mobile conservent des alertes documentées avec leurs
limites et dates de revue dans [l’audit A12](docs/AUDIT-DEPENDANCES.md).
Installation reproductible, génération, lint, build et installation runtime
ont été exécutés. La CI a passé ses 11 checks, dont migrations PostgreSQL,
mobile, frontend et E2E ([run](https://github.com/AmirGames/projet/actions/runs/38265964207)).
La [PR #219](https://github.com/AmirGames/projet/pull/219) est intégrée.
Le build/scan de l’image OCI réelle, le déploiement et la validation en
exploitation ne sont pas établis. Résultats : [registre A12](docs/etat-projet.md#étape-13--a12-audit-et-correction-des-dépendances).

## Étape 11 — A08 : sauvegardes distantes et restauration (12 octobre 2026)

`deploy/zup.sh backup` distingue désormais une archive locale, une copie
distante vérifiée et une restauration d'exercice. En production, la destination
rclone est requise par défaut ; `COMPLETED` n'est enregistré qu'après SHA-256
identique des deux objets distants et publication de leur manifeste. L'interface
des données ne propose le téléchargement/la restauration que pour ses exports
partiels. Configuration, clés, cibles provisoires, procédures et limites sont
dans le [guide A08](docs/SAUVEGARDES-RESTAURATION-A08.md) et son
[registre de preuves](docs/etat-projet.md#étape-11--a08-sauvegardes-distantes-et-restauration).
Le dépôt ne fournit pas ici de preuve d'accès au bucket, de restauration sur
infrastructure isolée ni de validation en exploitation.

## Étape 10 — A07 : facturation structurée et preuves légales (12 octobre 2026)

Le transport réel n'est pas activé : aucun opérateur/fournisseur ni données
d'identité attestées n'ont été communiqués. Le dépôt garde un point d'adaptation
Peppol, refuse maintenant les fournisseurs inconnus et les entrées UBL
manifestement invalides, sans présenter XML ou génération comme conformité.
Les essais Access Point, la réception/rapprochement et la preuve des pages
publiées restent bloqués. Obligations officielles datées, différences Belgique/
France, API, configuration, exploitation et validations à obtenir :
[guide A07](docs/FACTURATION-STRUCTUREE-A07.md). Les déploiements et validations
en exploitation ne sont pas établis.

## Santé et dépendances (A14)

`/health` mesure la vie du processus; `/health/ready` vérifie PostgreSQL et Redis
en production, sans exposer d'erreur d'infrastructure. ClamAV bloque uniquement
les dépôts de documents, et SMTP/les fournisseurs externes dégradent leurs
fonctions sans retirer le trafic général. Matrice, contrats, alertes et reprises :
[dépendances et santé](docs/DEPENDANCES-SANTE.md).

## Étape 07 — A13 : contrats API et preuves de parcours (11 octobre 2026)

Les contrats HTTP paiement sont figés par tests de routes (droits client/invité,
statuts, réponse `requires_action`). La CI ajoute une base PostgreSQL dédiée
pour les courses d'inscription A01/A02, liens A10, rotation A09 et acceptation
de livraison concurrente. Les tests simulés, intégrations PostgreSQL, essais
Stripe TEST/3DS externes et essais sur appareil sont distingués dans le
[contrat, la matrice de parcours et les procédures A13](docs/CONTRATS-API-A13.md).
La CI du SHA `bb3c3d2b9e221e6216920e8afd5ab923368ae2c8` a réussi ses 11 jobs
([preuve](https://github.com/AmirGames/projet/actions/runs/38158760374)), dont
les tests Jest Customer/Merchant, les intégrations PostgreSQL dédiées et E2E.
Le run ne couvre pas Stripe distant avec 3DS ni les appareils physiques. Aucune
intégration, livraison ou validation en exploitation n'est affirmée.

## Étape 06 — A09 : rotation atomique et reprenable des sessions (10 octobre 2026)

Le refresh parent est consommé et son successeur est créé dans une transaction
PostgreSQL. Une réponse perdue se reprend dix secondes avec la même clé de
demande; seul son hash et le `jti` du successeur sont stockés. Voir le
[contrat API, migration, exploitation et limites](docs/ROTATION-SESSIONS-A09.md)
et le [registre des preuves](docs/etat-projet.md#étape-06--a09-rotation-atomique-des-sessions).
Déploiement et validation en exploitation non établis.

## A11 — webhooks sortants ZupDrive

Le worker durable, la signature HMAC et les reprises sont décrits dans le
[contrat et la procédure de reprise](docs/WEBHOOKS-ZUPDRIVE-A11.md). Le flag
`ZUPDRIVE_WEBHOOKS_ENABLED` reste désactivé : aucune transition métier ZupDrive
n'émet encore ces événements. Aucun déploiement ni essai réel n'est revendiqué.

## Étape 05 — A10 : liens de compte à usage unique (10 octobre 2026)

Les liens de reset et de confirmation sont consommés par mutation conditionnelle
sur leur empreinte et leur expiration. Le reset révoque les sessions dans la même
transaction ; la confirmation rattache la fiche invitée dans sa transaction.
Une réémission invalide le lien précédent. Aucune migration ni variable nouvelle.
Voir le [contrat API, les commandes et l'exploitation](docs/LIENS-COMPTE-A10.md)
et le [registre des preuves](docs/etat-projet.md). Le déploiement et la
validation en exploitation restent à établir.

## Étape 04 — A05 : seconde authentification (10 octobre 2026)

Les comptes superowner/équipe EAT et DRIVE utilisent TOTP ; les gardes API et
temps réel contrôlent la session SSO, et les actions administratives/financières
sensibles exigent une preuve de cinq minutes. Les interfaces web et admin Expo
permettent inscription, rotation, révocation et récupération à usage unique.
Migration additive `0068_mfa`, trousseau AES existant, `MFA_MODE=enrollment`
avant couverture nominative puis `enforced` sur toutes les instances.
Le mode préparatoire n'atteste pas une obligation MFA pour les non-enrôlés.
Voir [guide et contrats API](docs/MFA.md), [preuves datées](docs/preuves-a05-2026-10-10.md)
et [registre](docs/etat-projet.md#étape-04--a05-mfa-des-comptes-privilégiés).
Développement/tests locaux et CI consignés ; la [PR #204](https://github.com/AmirGames/projet/pull/204)
a été intégrée le 10 octobre. Déploiement et validation en exploitation restent
des états distincts. Aucune opération d'argent réel n'a été exécutée ici.

## Étape 03 — A04 : concurrence des versements (9 octobre 2026)

Un paiement manuel, une annulation et la préparation d'un lot revendiquent le
même relevé sous état et rattachement attendus. Le perdant reçoit une erreur
métier 409 ; l'interface relit l'état. Une annulation ne libère jamais les gains
d'un relevé payé ou porté par un lot. Confirmation et refus contrôlent toutes
les lignes et montants figés, avec rollback complet en cas d'écart.

Aucune migration ou variable serveur A04 ; courses PostgreSQL réelles activées
par `PAYOUT_INTEGRATION=true`. Diagnostic en lecture seule et procédure de
rapprochement préparés, aucun virement réel. Voir le
[guide API/tests/exploitation](docs/VERSEMENTS-CONCURRENCE.md), les README
[backend](backend/README.md) et [frontend](frontend/README.md), les
[preuves datées](docs/preuves-a04-2026-10-09.md) et le
[registre de livraison](docs/etat-projet.md#étape-03--a04-concurrence-des-versements).

## Étape 02 — A03 : remboursements durables (9 octobre 2026)

Le remboursement d'un paiement reçu après refus ou abandon est enregistré dans
la transaction métier avant acquittement du webhook. Un worker PostgreSQL le
réconcilie et le reprend avec une clé Stripe persistante ; une création pending
ne vaut pas remboursement réussi. La supervision inclut les cas sans ID Stripe,
avec liste de revue et reprise réservées à la facturation habilitée.

Migration additive et backfill des cas historiques **à examiner**, sans mouvement
automatique. Configuration, API, tests et procédures :
[guide de reprise](docs/REMBOURSEMENTS-REPRISE.md),
[README backend](backend/README.md),
[preuves datées](docs/preuves-a03-2026-10-09.md),
[état développé/testé/intégré/déployé](docs/etat-projet.md#étape-02--a03-remboursements-durables).
Cette livraison n'atteste ni déploiement ni validation Stripe LIVE.


## 📋 Vue d'ensemble

**Zupone** est un groupe technologique belge spécialisé dans les solutions digitales pour la mobilité urbaine et la livraison de repas. Nous développons deux écosystèmes distincts :

> **Statut ZupDrive — en standby.** Le projet reste en pause tant que Zupeat
> n'est pas opérationnel, stable et générateur de revenus. Sa reprise sera
> réévaluée lorsque ces conditions seront réunies.

1. **Zupeat** : Livraison de repas (restaurants → clients via livreurs)
2. **ZupDrive** : Transport de passagers (type Uber/Bolt)

Notre mission : **Créer des solutions de mobilité et de livraison innovantes, sécurisées et centrées sur l'expérience utilisateur.**

---

## 🏢 Structure du Groupe

Le groupe Zupone est composé de **deux écosystèmes** distincts :

### 1️⃣ **Zupeat** - Plateforme de Livraison de Repas
Composée de 3 applications :
- **zupeat.com** : App client (commande repas)
- **manager.zupeat.com** : App commerçant (gère restaurant)
- **delivery.zupeat.com** : App livreur (livraison repas)

### 2️⃣ **ZupDrive** - Application de Transport de Passagers (VTC)
Composée de 2 applications :
- **Client app** : Demande trajet (point A → point B)
- **Chauffeur app** : Accepte trajets et conduit passagers

---

## 🍽️ Zupeat - Plateforme de Livraison de Repas

### Description
**Zupeat** est la plateforme centrale de livraison de repas qui connecte les **restaurants**, les **livreurs** et les **clients**. Elle comprend 3 applications distinctes :

### 3 Applications Zupeat

#### 1️⃣ **zupeat.com** - App Client
- 👥 Les clients découvrent restaurants, consultent menus, passent commandes
- 🔍 Recherche/filtrage restaurants par cuisine, localisation, note
- 🛒 Panier, gestion commandes, suivi livraison en temps réel
- 💳 Paiement par carte via Stripe quand la capacité est configurée ; espèces disponibles selon le moyen activé par le commerce (retrait uniquement).
- ⭐ Notation restaurant/livreur, historique commandes

#### 2️⃣ **manager.zupeat.com** - App Commerçant
- 🏪 Commerçants gèrent leur établissement et catalogue
- 📋 Gestion menus (catégories, articles, prix, photos)
- 📊 Tableau de bord (commandes en temps réel, chiffre d'affaires, statistiques)
- ✅ Acceptation/refus commandes, notification livreur
- 💰 Gestion paiements, reversements, analytics détaillées
- 🚚 Gestion livraisons associées, suivi livreurs

#### 3️⃣ **delivery.zupeat.com** - App Livreur
- 📱 Application mobile Expo / React Native (`mobile/apps/delivery`)
- 📦 Réception commandes à livrer, acceptation/refus
- 📍 Suivi temps réel pour client et restaurant
- 💵 Gains et historique des courses

### Infrastructure Commune
- 📊 **Tableau de Bord** : Monitoring en temps réel des commandes, livreurs et métriques de performance
- 💰 **Paiements** : carte via Stripe et moyens définis par commerce ; l'enum des moyens ne signifie pas que PayPal/Apple Pay/Google Pay aient un adaptateur d'encaissement actif.
- 📈 **Analytics & Reporting** : Données détaillées sur les commandes, revenus et comportement utilisateur
- 🔔 **Notifications** : courriels SMTP, push navigateur et push mobile selon les capacités configurées ; l'envoi SMS n'est pas livré.
- 📱 **Support Multi-plateforme** : Web responsive + apps mobiles

### Stack Technologique Zupeat
- **Backend API** : Node.js/Express, TypeScript, PostgreSQL, Redis (Prisma ORM)
- **Frontend Client** : Next.js 16, React 19, Tailwind CSS, next-intl
- **App Commerçant** : Next.js 16 (dashboard responsive)
- **App Livreur** : Expo / React Native, avec modules natifs Android pour certaines alertes
- **Paiements** : Stripe (carte), confirmation par webhook signé ; remboursement idempotent. Pas de connecteur PayPal livré.
- **Infrastructure** : `deploy/Caddyfile`, scripts d'exploitation et modèle d'environnement pour Scaleway/VPS avec PostgreSQL et Redis. Le guide décrit Docker Compose, mais `docker-compose.prod.yml` est référencé par les scripts et absent de cet instantané versionné ; Kubernetes/AWS/GCP ne sont pas établis ici.
- **Temps réel** : WebSockets/Redis pour notifications et suivi GPS
- **Emails** : Mailpit (local), service externe (production)

### Objectifs Zupeat
- ✅ Offrir expérience fluide pour les 3 acteurs (client, commerçant, livreur)
- ✅ Optimiser délais de livraison (<35 min)
- ✅ Sécuriser paiements et données
- ✅ Maximiser satisfaction clients et restaurants

---

## 🚚 Application mobile ZupEat livreur (delivery.zupeat.com)

### Description
L'application est une app Expo / React Native (le domaine `delivery.zupeat.com` est le site web, pas l'application native). Le dépôt fournit les apps Android/iOS et un module natif Android pour les alertes plein écran. Les preuves d'APK, push et appareil réel sont datées dans [l'état du projet](docs/etat-projet.md) et [la validation mobile](mobile/apps/delivery/VALIDATION.md).

### Fonctionnalités Clés (Complément à delivery.zupeat.com)

#### 📦 Gestion des Commandes
- Affichage en temps réel des livraisons disponibles
- Système d'acceptation/refus simple et rapide
- Historique et suivi des commandes assignées
- Notifications push prioritaires

#### 🗺️ Navigation Intégrée (Feature Premium)
- **Google Maps SDK intégré** : Navigation turn-by-turn sans quitter l'app
- Itinéraires optimisés pour plusieurs livraisons
- Estimation de temps d'arrivée en temps réel
- Évaluation du trafic et suggestions d'itinéraires alternatifs

#### 📍 Localisation et Suivi
- Position de disponibilité lorsque le livreur est en ligne, et suivi pendant une livraison acceptée
- Arrêt du suivi de disponibilité pendant une pause ou après déconnexion; les données de course restent rattachées à la commande
- La conservation des coordonnées de commande et des preuves doit suivre la politique de confidentialité et les durées validées

#### ✅ Admissibilité des Livreurs
- Le numéro BCE est demandé à l'inscription selon la règle de test choisie par ZupEat
- Le format est vérifié automatiquement; un opérateur doit vérifier le registre officiel avant l'activation
- Un numéro BCE ne démontre pas, à lui seul, le statut indépendant; le formulaire de pays France nécessite encore une règle pour les identifiants étrangers

#### ✅ Confirmation de Livraison
- Signature électronique des clients (optionnel)
- Photo de livraison
- Commentaires et notes
- Prise de photo du client avec la commande

#### 💬 Communication
- Chat intégré avec clients
- Chat avec restaurants
- Support technique in-app

#### 💵 Gestion Financière
- Suivi des revenus en temps réel
- Historique des paiements
- Détails des commissions et bonus

### Stack Technologique
- **Plateforme** : Expo / React Native, TypeScript ; module Expo natif Android pour les alertes
- **API** : REST et Socket.IO vers l'API centrale
- **Carte** : OpenStreetMap et OSRM selon la configuration ; navigateurs externes facultatifs

### Avantages pour les Livreurs
✨ Interface intuitive et facile à maîtriser  
⚡ Performances optimisées pour batterie et données mobiles  
🛡️ Sécurité des données personnelles  
📱 Fonctionne sur tous les appareils Android modernes  

---

## 🚗 ZupDrive - Application de Transport de Passagers (En Développement)

### Description
**ZupDrive** est le projet émergent du groupe Zupone. Il s'agit d'une **plateforme de transport urbain de passagers** (VTC - Véhicules de Transport avec Chauffeur), similaire à Uber ou Bolt. Les clients demandent un trajet, les chauffeurs acceptent et les conduisent d'un point A à un point B.

L’application mobile chauffeur utilise l’authentification commune ZupOne et les routes chauffeur `/api/zupdrive/chauffeur/me/*` (tableau, disponibilité, propositions, étapes) ainsi que `/api/zupdrive/payment/earnings`. Le parcours est en cours de correction A06 et demeure **hors périmètre du pilote** jusqu’à validation avec PostgreSQL de test et un appareil/émulateur connecté ; voir [l’état A06](docs/etat-projet.md) et le [guide de validation](docs/validation-mobile-zupdrive-driver.md).

### Modèle de Fonctionnement
- 👤 **Clients** : Téléchargent l'app, demandent un trajet (point A → point B)
- 🚕 **Chauffeurs** : Reçoivent les demandes de trajet et acceptent les courses
- 📍 **Géolocalisation** : Suivi en temps réel du trajet et localisation du chauffeur
- 💰 **Paiements** : Tarification dynamique selon la distance, demande et trafic
- ⭐ **Notation** : Système de notation client ↔ chauffeur pour la qualité

### Fonctionnalités Principales
- **App Client** : Demander un trajet, tracker le chauffeur, payer
- **App Chauffeur** : Recevoir demandes de trajet, navigation intégrée, historique des courses
- **Gestion Administrativa** : Vérification des documents (licence, assurance, BCE)
- **Système de Paiement** : Paiement sécurisé, payout chauffeurs
- **Support & Feedback** : Chat support, signalement de problèmes, notation
- **Analytics** : Dashboard chauffeur (revenus, trajets) et admin (métriques)

### Stack Technologique
- **Backend** : API Node.js/Express, PostgreSQL, Redis pour temps réel
- **Frontend Web** : Dashboard admin (Next.js)
- **App Client** : iOS/Android (React Native ou Expo)
- **App Chauffeur** : iOS/Android (React Native ou Expo)
- **Localisation** : Google Maps API, tracking temps réel
- **Paiements** : Stripe, gestion des payouts

### Objectifs Stratégiques
🎯 Lancer MVP en Belgique (Namur, Bruxelles, Liège)  
🎯 Atteindre 500+ chauffeurs actifs en Q1 2027  
🎯 Générer stabilité opérationnelle et rentabilité  
🎯 Expansion régionale en Wallonie/Flandre  

---

## 🔗 Écosystème Zupone

Deux écosystèmes **indépendants** mais appartenant au même groupe :

```
┌──────────────────────────────────────────────────┐
│            GROUPE ZUPONE                         │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌─────────────────────────┐                    │
│  │    ZUPEAT (Food)        │                    │
│  ├─────────────────────────┤                    │
│  │ Restaurants → Livreurs  │                    │
│  │ → Clients de repas      │                    │
│  │                         │                    │
│  │ Platform + Driver App   │                    │
│  └─────────────────────────┘                    │
│                                                  │
│  ┌─────────────────────────┐                    │
│  │  ZUPDRIVE (Mobility)    │                    │
│  ├─────────────────────────┤                    │
│  │ Chauffeurs → Passagers  │                    │
│  │ (Point A → Point B)     │                    │
│  │                         │                    │
│  │ Client App + Driver App │                    │
│  └─────────────────────────┘                    │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Structure
- **Zupeat** : Plateforme de livraison de repas (restaurants partenaires)
  - App Client (web/mobile) : clients commandent repas
  - App Livreur (Android) : livreurs livrent les commandes
  
- **ZupDrive** : App de transport urbain (type Uber/Bolt)
  - App Client (mobile) : clients demandent trajets
  - App Chauffeur (mobile) : chauffeurs prennent les trajets

Les deux écosystèmes partagent la même infra backend/tech mais ont des modèles métier distincts.

---

## 🚀 Timeline et Roadmap

### **Début 2027 - Lancement Zupeat** 📅
**Objectifs**
- 🎯 Onboarder **10 restaurants partenaires** 
- 🎯 Recruter **quelques livreurs** (5-10 initialement)
- 🎯 Stabiliser plateforme zupeat.com + manager.zupeat.com + delivery.zupeat.com
- 🎯 Validater modèle économique et satisfactions clients/restaurants/livreurs

**Focus**
- Intégration restaurants (menus, paiements)
- Formation livreurs et support
- Bug fixes et optimisations
- Analytics et feedback utilisateurs

---

### **Fin 2027 - Lancement ZupDrive** 📅
**Objectifs**
- 🎯 Lancer app transport passagers (client + chauffeur)
- 🎯 MVP stable et opérationnel
- 🎯 Recrutement chauffeurs (50+ minimum)
- 🎯 Vérification documents (licence, assurance, BCE)

**Focus**
- Intégration paiements et géolocalisation
- Vérifications et compliance chauffeurs
- Formation chauffeurs
- Support et notifications

---

### **2028+ - Consolidation et Expansion** 📈
**Zupeat**
- Expansion à 5-10 villes belges
- 100+ restaurants partenaires
- 200+ livreurs actifs
- Partenariats stratégiques (chaînes restaurants, hôtels)

**ZupDrive**
- Expansion régionale (Wallonie)
- 500+ chauffeurs actifs
- Rentabilité opérationnelle
- Intégration avec services complémentaires

**Groupe**
- Plateforme consolidée multi-services
- Analytics et optimisations cross-platform
- Expansion nationale (Flandre, Bruxelles)

---

## 👨‍💻 Stack Technologique Global

| Composant | Technologies |
|-----------|--------------|
| **Backend** | Node.js, Express, TypeScript, Prisma |
| **Frontend Web** | Next.js, React, TypeScript |
| **Mobile** | Expo / React Native (client, commerçant, livreur, admin) |
| **Base de données** | PostgreSQL ; Redis pour coordination/cache/temps réel |
| **Déploiement documenté** | Caddy et scripts Scaleway/VPS ; Docker Compose décrit, manifeste production non présent dans cet instantané |
| **Cartographie** | OpenStreetMap et OSRM ; fournisseurs et disponibilité dépendent de la configuration |

---

## 🌐 Domaines Web

| Service | Domaine | Purpose |
|---------|---------|---------|
| **Groupe** | zupone.com | Présentation groupe, blog, infos générales |
| **Zupeat** | zupeat.com | App client (commande repas) |
| **Zupeat** | manager.zupeat.com | Dashboard commerçant (gestion restaurant) |
| **Zupeat** | delivery.zupeat.com | App livreur (gestion livraisons) |
| **ZupDrive** | zupdrive.com | Présentation et app client transport |
| **ZupDrive** | driver.zupdrive.com | App chauffeur (gestion trajets) |

---

## 📞 Contact & Support

- **Email** : [À définir]
- **Support Clients** : In-app chat + email
- **Support Restaurants/Chauffeurs** : In-app support + email
- **Signalements Bugs** : GitHub Issues (ce repo)

---

## 📄 Licence

[À définir selon les besoins légaux du groupe]

---

**Dernière mise à jour** : Octobre 2026  
**Version** : 1.0

