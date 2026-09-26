# Zupone

Une plateforme de commande en ligne pour les commerces de proximité : le
commerçant tient son catalogue et ses commandes, le client commande depuis sa
vitrine, un livreur assure la course. Plusieurs commerçants cohabitent sur la
même installation, chacun chez lui.

Restaurants, boulangeries, épiceries — tout commerce qui vend des articles à
emporter ou à livrer.

> **État du projet.** Fonctionnel de bout en bout en local : on crée un compte,
> une boutique, un menu, on commande sans compte, le commerçant suit sa commande
> et un livreur — une fois son dossier validé par la plateforme — la prend en
> charge. Le paiement en ligne par carte (Stripe) est confirmé par webhook et
> remboursé automatiquement quand une commande est refusée. Rien n'est encore
> déployé.

## Ce que fait la plateforme

### Le client
- Parcourt les commerces, par recherche ou par proximité
- **Une seule vitrine**, à l'adresse lisible du commerce (`/store/<slug>`) : les
  anciens liens par identifiant y mènent encore
- Consulte un menu rangé par catégories, avec les plats épuisés signalés
- Choisit une déclinaison quand un plat en a (taille, type de pâtes…)
- Garde **un panier par commerce** : passer d'un commerce à l'autre ne mélange rien
- Commande **sans créer de compte** : coordonnées, adresse de livraison avec
  suggestions, ou créneau de retrait tenu aux heures d'ouverture réelles
- Voit ses frais de livraison et le minimum de commande **avant** de valider
- Suit sa commande sur une carte : distance restante, durée estimée, position
  du livreur — et un avertissement quand le livreur a perdu son signal GPS
- Reçoit un **code de remise** à quatre chiffres, qu'il donne au livreur à la
  porte — et sait ensuite comment sa commande a été remise
- Est prévenu **par courriel et par SMS** quand un livreur prend sa commande,
  quand elle part du commerce (avec le code de remise) et quand elle est livrée
- Retrouve une commande passée sans compte par son lien de suivi
- Garde ses **commerces favoris**, d'un clic sur le cœur de leur carte
- Dispose d'un **délai de 10 s** pour annuler une commande avant son envoi, et
  d'un bandeau « commande en cours » dans son espace
- **Tout compte a un espace client**, commerçants et livreurs compris : ils
  commandent comme n'importe qui, et les commandes passées sans compte se
  rattachent au compte qui porte la même adresse électronique

### Le commerçant
- Inscription, puis **validation par la plateforme** : il prépare sa boutique
  (catalogue, catégories, horaires, zones) mais ne peut ni l'ouvrir, ni
  recevoir de commande, ni apparaître aux clients tant que ses pièces exigées
  (Kbis ou BCE, identité du propriétaire, RIB) ne sont pas validées et que la
  plateforme n'a pas validé le commerce
- **Prévenu 30 jours avant l'expiration** d'une pièce, dans son espace et par
  courriel ; le jour venu la pièce passe « expirée » et la plateforme l'apprend,
  sans que le commerce soit fermé d'office
- Plusieurs boutiques par compte, selon la formule souscrite
- Catalogue : catégories et plats réordonnables au glisser-déposer, déclinaisons,
  disponibilité basculable en direct (le client la voit changer sans recharger)
- Commandes : liste, détail, changement d'état, facture imprimable
- Horaires d'ouverture **service par service** : le midi et le soir dans la
  même journée, et les fermetures après minuit (17h30 – 01h00)
- Créneaux de retrait, ouverture et fermeture immédiate
- Zones de livraison en anneaux autour de la boutique, **réglées sur une carte** :
  il pose son commerce d'un clic, tire une poignée pour fixer le rayon et voit
  ce qu'il couvre — rayon, frais et montant minimum par zone
- Genre du commerce (restaurant, épicerie, fleuriste…) et type de cuisine,
  demandés dès la création
- Codes promo, moyens de paiement proposés, taxes, clientèle
- Statistiques de vente, exports
- **Son profil** : identité de facturation, propriétaire du commerce, numéro de
  TVA, compte bancaire et justificatifs — la page dit ce qui manque encore pour
  être facturé et pour être payé. L'IBAN n'est jamais réaffiché en entier. Un
  compte suspendu y garde accès : c'est là qu'il complète ce qu'on lui reproche
- **Une boutique peut porter sa propre identité de facturation** (raison
  sociale, TVA, immatriculation) quand elle relève d'une autre société ; sinon
  elle hérite de celle du compte
- Support par tickets, avec fil de discussion

### Le livreur
- Inscription, puis **dossier examiné par la plateforme** : il dépose ses pièces
  (identité, permis, assurance, carte grise — seule l'identité à vélo), suit leur
  examen pièce par pièce, et lit le motif quand l'une est refusée
- Tant que son dossier n'est pas validé, il ne peut pas se mettre en ligne et
  aucune course ne lui est proposée
- Passage en ligne, position transmise
- Courses proposées automatiquement au livreur disponible le plus proche. Une
  course que tous ont laissée passer **repart pour un nouveau tour** trois
  minutes plus tard, trois fois au plus, sans que le commerçant ait à la relancer
- Acceptation, refus, étapes de la course. Une fois la course acceptée, il la
  voit sur une carte (commerce, client, lui-même) et lance le GPS de son
  téléphone vers le commerce, puis vers le client
- **Payé sur la distance du commerce au client** : frais fixe plus un tarif au
  kilomètre, les mêmes pour tous — le trajet jusqu'au commerce est affiché,
  pas payé
- **Pause** de 5 minutes à 4 heures : il reste en ligne mais ne reçoit plus de
  course, et reprend quand il veut
- **Perte du signal** : sans position depuis 2 minutes, il est prévenu, le
  commerce et le client aussi s'il est en course ; au bout de 10 minutes sans
  course, il est mis hors ligne pour ne plus être compté disponible
- **Notifications** sur son téléphone, onglet fermé : nouvelle course, signal
  perdu, fin de pause, réponse du support
- Historique de ses courses, et **statistiques** sur 7, 30 ou 90 jours :
  gains, gain à l'heure, taux d'acceptation, notes, comparaison avec la
  période précédente
- **Discute en direct avec le support** de la plateforme ; un message envoyé
  pendant une course y est rattaché
- **Prouve la remise** : le code du client, ou la photo du dépôt quand celui-ci
  est absent — sans preuve, la course ne se clôt pas
- **Sait s'il est payé** : ce qui lui reste dû, ce qui est arrêté et attend le
  virement, ce qui est arrivé — et le détail de chaque relevé

### La plateforme (superowner)
- Commerçants : formule, suspension, fermeture, restauration depuis sauvegarde
- Formules d'abonnement réglables : nom, prix, quota de boutiques, **commission
  sur les ventes**, arguments de vente
- Facturation : commission du mois par commerçant, avec son calcul détaillé
- Boutiques : une fiche par commerce, et la correction des seuls champs dont
  la plateforme répond — adresse et coordonnées, adresse publique, contact. Le
  catalogue, les prix et les horaires restent au commerçant
- Commerçants, leur dossier : identité de facturation reportée sur la facture du
  mois, et examen de leurs justificatifs — un refus se motive, et le commerçant
  en est prévenu
- Livreurs : dossiers à traiter, examen des pièces une à une, validation,
  suspension et rétablissement — chaque geste motivé et journalisé
- Attribution des courses réglable : rayon de recherche, délai pour accepter,
  frais fixe et tarif au kilomètre des livreurs
- Support livreurs en direct : une boîte de réception par livreur, avec son
  état (en ligne, en course, signal perdu) et de quoi l'appeler
- Versements : ce qu'elle doit et à qui, arrêté des relevés d'une période,
  versement avec sa référence — une course payée ne l'est jamais deux fois
- Santé du système : cinq relevés chiffrés, et ce qu'il faut faire pour chacun
- Annonces diffusées au public visé — commerçants, clients, livreurs — et
  reçues par chacun d'eux
- Journal des actions administratives et journal des accès
- Sauvegardes, mode maintenance, clés d'API, webhooks
- Support : tous les tickets, réponses, priorités
- **Pages légales** (mentions, CGU, CGV, conditions commerçants et livreurs,
  confidentialité, cookies) : chaque publication crée une version, et
  l'acceptation des conditions est enregistrée à l'inscription et à la commande

### Partout
- **Un seul compte, plusieurs espaces** : le logo en haut à gauche ouvre les
  autres espaces auxquels le compte a droit — client, commerçant, livreur,
  administration
- Le site en **français et en anglais**, choisis avec la région dans la
  fenêtre « Langue et région » (France, Belgique, Suisse, Luxembourg, Canada,
  Royaume-Uni, Irlande, États-Unis…) : les pages publiques sont servies sous
  un sous-répertoire de région (`/be-fr/`, `/fr-fr/`…), déclaré aux moteurs de
  recherche (hreflang, `sitemap.xml`). Le pays détecté — Belgique par défaut,
  ou France — règle l'adresse, l'indicatif téléphonique (+32 / +33) et la
  réglementation des pages « Devenir »
- Pages de présentation **Devenir livreur, commerçant, chauffeur** (le VTC est
  annoncé « Bientôt disponible »)

## Pile technique

| | |
|---|---|
| **Frontend** | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS |
| **Backend** | Express 5, TypeScript, Prisma 7 (adaptateur `@prisma/adapter-pg`) |
| **Base de données** | PostgreSQL |
| **Temps réel** | Socket.IO (disponibilité des plats, notifications, suivi de livraison) |
| **Authentification** | JWT (jeton d'accès + jeton de renouvellement) |
| **Courriel** | SMTP par nodemailer (Mailpit en développement) |
| **Notifications** | Web Push (clés VAPID) et SMS par Twilio, tous deux facultatifs : un canal non configuré est simplement sauté |
| **Langues** | next-intl, français et anglais (`frontend/messages/`) |
| **Adresses** | Base Adresse Nationale pour la France, Photon (OpenStreetMap) pour la Belgique et au-delà — les deux interrogés ensemble. Google Places (New) en option, si la pertinence prime sur le coût |
| **Cartes** | Leaflet, fond de carte OpenStreetMap (sans clé ni compte) |
| **Paiement** | Stripe — intention de paiement, webhook signé (`POST /api/payments/webhook`), remboursement |

Un seul dépôt, deux applications :

```
backend/    API REST — 40 fichiers de routes, 61 services (hors tests), 53 modèles Prisma
frontend/   Next.js — 142 pages
```

## Démarrer

Il faut **Node 20.19 ou plus** (Prisma 7 et Next.js 16) et **PostgreSQL**.

```bash
git clone https://github.com/AmirGames/projet.git
cd projet
```

### 1. La base de données

```bash
createdb zupone_dev
```

### 2. L'API

```bash
cd backend
npm install
cp .env.example .env     # puis renseignez DATABASE_URL et les deux secrets JWT
npx prisma migrate deploy
npm run dev              # http://localhost:3001
```

L'historique des migrations tient en une seule migration de référence,
`0001_initial_schema`, qui crée tout le schéma sur une base vide. Chaque
changement de schéma ajoute ensuite sa propre migration
(`npx prisma migrate dev --name <nom>`), à committer avec le schéma.

Une base créée **avant** cette remise à plat (par `db push` ou par
l'ancienne chaîne de migrations) a déjà toutes les tables : il suffit, une
fois, d'enregistrer la migration de référence comme appliquée, après avoir
vérifié qu'il ne manque rien :

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npx prisma migrate resolve --applied 0001_initial_schema
```

### 3. Le site

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev              # http://localhost:3000
```

### 4. Le premier compte

**Le premier compte inscrit devient la plateforme** (superowner) : inscrivez-vous
en premier sur <http://localhost:3000/signup>, avant de créer des comptes
commerçants. Les suivants sont des commerçants ordinaires.

### Facultatif : les courriels en développement

Confirmation d'adresse et mot de passe oublié envoient de vrais messages.
[Mailpit](https://mailpit.axllent.org/) les affiche sans rien expédier :

```bash
mailpit                  # SMTP sur 1025, interface sur http://localhost:8025
```

### Facultatif : un jeu de démonstration

```bash
cd backend
node scripts/verification/reinitialiser.mjs   # vide la base
node scripts/seed-demo.mjs                    # plateforme, commerçant, livreur
```

Il affiche les comptes créés et leur mot de passe.

## Vérifications

Le projet ne se vérifie pas avec des tests unitaires à simulacres, mais avec des
**scripts qui interrogent une vraie API branchée sur une vraie base**, et des
scripts qui **pilotent un vrai navigateur**. Un contrôle n'affirme jamais un code
HTTP : il relit la donnée pour vérifier qu'elle a bougé.

```bash
# API : 1574 contrôles, 48 suites
cd backend
createdb zupone_test
DATABASE_URL="postgresql://.../zupone_test" npx prisma migrate deploy
DATABASE_URL="postgresql://.../zupone_test" PORT=3099 npm run dev   # un terminal
DATABASE_URL="postgresql://.../zupone_test" VERIF_API_URL=http://localhost:3099 npm run verif

# Navigateur : 716 contrôles, 27 suites
cd frontend
npm i -D playwright && npx playwright install chromium
VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3099 npm run verif:invite
```

`backend/scripts/verification/LISEZ-MOI.md` et `frontend/scripts/LISEZ-MOI.md`
détaillent chaque suite et ses prérequis.

> La base visée est **vidée** à chaque script. Un garde-fou refuse de s'exécuter
> si son nom ne contient pas `test`.

## Webhooks

La plateforme prévient un système extérieur de ce qui s'y passe : commandes,
tickets, suspensions. Six événements, un envoi `POST` signé en HMAC-SHA256, et
trois relances si le destinataire ne répond pas. Les abonnements se gèrent dans
**Administration → Webhooks**.

Le format exact, la vérification de la signature en Node, PHP et Python, et la
charge utile de chaque événement sont dans
[`DOCUMENTATION-WEBHOOKS.md`](DOCUMENTATION-WEBHOOKS.md).

## Surveillance

**Administration → Surveillance** montre le site en fonctionnement, rafraîchi
toutes les 10 secondes :

- **Trafic** : requêtes par minute, taux d'erreurs 4xx/5xx, temps de réponse
  (médiane, p95, p99), sur l'heure écoulée, et le détail route par route
- **Serveur** : processeur, mémoire, retard de la boucle d'événements, charge,
  connexions temps réel
- **Services externes** : base de données, SMTP, Redis, Stripe, SMS, push
- **Tâches de fond** : dernier passage, durée, échecs — une tâche qui ne tourne
  plus se voit
- **Pannes serveur** (réponses 5xx, avec leur pile) et **erreurs des visiteurs**,
  remontées de leur navigateur et regroupées par empreinte

Une vigie contrôle tout cela toutes les 30 secondes. Quand un seuil est franchi
(base injoignable, plus de 2 % de 5xx, p95 au-delà de 1,5 s, mémoire à 85 %,
tâche en échec…), elle ouvre un incident et prévient par courriel les comptes
plateforme — et `MONITORING_ALERT_EMAILS`, `MONITORING_WEBHOOK_URL` s'ils sont
renseignés —, puis signale le retour à la normale.

**Disponibilité** : l'API (serveur et base) et le site public sont relevés
chaque minute, et l'historique est gardé 90 jours en base. La page en tire la
disponibilité sur 24 h, 7, 30 et 90 jours, une frise d'un trait par jour et la
liste des indisponibilités. Un trou dans les relevés de l'API compte comme une
panne : un serveur arrêté ne relève rien. D'autres adresses se surveillent avec
`UPTIME_URLS` (voir `backend/.env.example`).

**Depuis l'extérieur** : tout ce qui précède tourne dans le serveur, et tombe
avec lui si l'hébergement entier s'arrête. Le workflow
`.github/workflows/disponibilite.yml` interroge le site depuis GitHub toutes les
dix minutes et échoue — GitHub prévient alors par courriel — dès qu'une adresse
ne répond plus. Il suffit de renseigner la variable de dépôt `UPTIME_URLS`
(Settings → Secrets and variables → Actions → Variables), une adresse par ligne.

Pour une autre sonde externe (UptimeRobot, Better Stack, répartiteur de charge) :

| Adresse | Répond |
|---|---|
| `GET /health` | 200 tant que le processus tourne |
| `GET /health/ready` | 200 si la base répond, **503** sinon |

Les mesures sont gardées en mémoire, par instance et depuis son démarrage.

## Plusieurs domaines

Le site sait se répartir sur trois domaines — public, commerçant, livreur — ou
tenir sur un seul. Il suffit de renseigner les trois noms côté frontend
(`NEXT_PUBLIC_DOMAINE_*`) : chaque page est alors servie par le domaine qui lui
revient, et une page demandée au mauvais domaine redirige vers le bon. Laissez-les
vides pour rester sur un domaine unique.

## Ce qui n'est pas terminé

Par honnêteté, ce qui manque encore :

- **Les commandes en mode test**, pour qu'un commerçant s'entraîne sans polluer
  ses statistiques.
- **Les vérifications des derniers chantiers livreur** : pause, perte du
  signal, notifications, support en direct, statistiques, nouveaux tours
  d'attribution et paiement à la distance n'ont pas encore leur suite.
- **Le stock par ingrédient** (une pizza consomme de la mozzarella). Aujourd'hui
  la disponibilité se bascule à la main, plat par plat.
- **Le texte des pages légales** : les pages existent et se modifient depuis
  l'espace superowner, mais le texte de départ garde des champs entre crochets
  à remplir avant d'ouvrir au public.
- **Les applications mobiles** (`mobile/apps/merchant`, `delivery`, `customer`)
  sont écrites mais pas encore publiées. Celle du livreur n'envoie sa position
  qu'au premier plan ; celle du client ne commande qu'avec un compte (le site
  garde la commande sans compte). Leurs cartes s'appuient sur les serveurs
  publics d'OpenStreetMap et d'OSRM, à remplacer par un service payant ou
  hébergé avant l'ouverture au public.
- Ni file d'attente, ni hébergement d'images externe, ni remontée d'erreurs :
  les variables correspondantes sont commentées dans `.env.example`.

## Licence

Projet privé. Tous droits réservés.
