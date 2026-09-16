# Zupone

Une plateforme de commande en ligne pour les commerces de proximité : le
commerçant tient son catalogue et ses commandes, le client commande depuis sa
vitrine, un livreur assure la course. Plusieurs commerçants cohabitent sur la
même installation, chacun chez lui.

Restaurants, boulangeries, épiceries — tout commerce qui vend des articles à
emporter ou à livrer.

> **État du projet.** Fonctionnel de bout en bout en local : on crée un compte,
> une boutique, un menu, on commande sans compte, le commerçant suit sa commande
> et un livreur la prend en charge. Le paiement en ligne reste incomplet (voir
> [Ce qui n'est pas terminé](#ce-qui-nest-pas-terminé)). Rien n'est encore
> déployé.

## Ce que fait la plateforme

### Le client
- Parcourt les commerces, par recherche ou par proximité
- Consulte un menu rangé par catégories, avec les plats épuisés signalés
- Choisit une déclinaison quand un plat en a (taille, type de pâtes…)
- Garde **un panier par commerce** : passer d'un commerce à l'autre ne mélange rien
- Commande **sans créer de compte** : coordonnées, adresse de livraison avec
  suggestions, ou créneau de retrait tenu aux heures d'ouverture réelles
- Voit ses frais de livraison et le minimum de commande **avant** de valider
- Suit sa commande : distance restante, durée estimée, position du livreur
- Retrouve une commande passée sans compte par son lien de suivi

### Le commerçant
- Plusieurs boutiques par compte, selon la formule souscrite
- Catalogue : catégories et plats réordonnables au glisser-déposer, déclinaisons,
  disponibilité basculable en direct (le client la voit changer sans recharger)
- Commandes : liste, détail, changement d'état, facture imprimable
- Horaires d'ouverture, créneaux de retrait, ouverture et fermeture immédiate
- Zones de livraison en anneaux autour de la boutique : rayon, frais et montant
  minimum par zone
- Codes promo, moyens de paiement proposés, taxes, clientèle
- Statistiques de vente, exports
- Support par tickets, avec fil de discussion

### Le livreur
- Inscription et espace à lui
- Passage en ligne, position transmise
- Courses proposées automatiquement au livreur disponible le plus proche
- Acceptation, refus, étapes de la course, rémunération calculée

### La plateforme (superowner)
- Commerçants : formule, suspension, fermeture, restauration depuis sauvegarde
- Formules d'abonnement réglables : nom, prix, quota de boutiques, **commission
  sur les ventes**, arguments de vente
- Facturation : commission du mois par commerçant, avec son calcul détaillé
- Santé du système : cinq relevés chiffrés, et ce qu'il faut faire pour chacun
- Journal des actions administratives et journal des accès
- Sauvegardes, mode maintenance, clés d'API, webhooks
- Support : tous les tickets, réponses, priorités

## Pile technique

| | |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| **Backend** | Express, TypeScript, Prisma |
| **Base de données** | PostgreSQL |
| **Temps réel** | Socket.IO (disponibilité des plats, notifications, suivi de livraison) |
| **Authentification** | JWT (jeton d'accès + jeton de renouvellement) |
| **Courriel** | SMTP par nodemailer (Mailpit en développement) |
| **Adresses** | Base Adresse Nationale, ou Photon (OpenStreetMap) pour l'international |
| **Paiement** | Stripe (intention de paiement ; webhook et remboursement à faire) |

Un seul dépôt, deux applications :

```
backend/    API REST — 37 routeurs, 39 services, 42 modèles Prisma
frontend/   Next.js — 80 pages
```

## Démarrer

Il faut **Node 18 ou plus** et **PostgreSQL**.

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
npx prisma db push
npm run dev              # http://localhost:3001
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
# API : 904 contrôles, 28 suites
cd backend
createdb zupone_test
DATABASE_URL="postgresql://.../zupone_test" npx prisma db push
DATABASE_URL="postgresql://.../zupone_test" PORT=3099 npm run dev   # un terminal
DATABASE_URL="postgresql://.../zupone_test" VERIF_API_URL=http://localhost:3099 npm run verif

# Navigateur : 344 contrôles, 15 suites
cd frontend
npm i -D playwright && npx playwright install chromium
VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3099 npm run verif:invite
```

`backend/scripts/verification/LISEZ-MOI.md` et `frontend/scripts/LISEZ-MOI.md`
détaillent chaque suite et ses prérequis.

> La base visée est **vidée** à chaque script. Un garde-fou refuse de s'exécuter
> si son nom ne contient pas `test`.

## Plusieurs domaines

Le site sait se répartir sur trois domaines — public, commerçant, livreur — ou
tenir sur un seul. Il suffit de renseigner les trois noms côté frontend
(`NEXT_PUBLIC_DOMAINE_*`) : chaque page est alors servie par le domaine qui lui
revient, et une page demandée au mauvais domaine redirige vers le bon. Laissez-les
vides pour rester sur un domaine unique.

## Ce qui n'est pas terminé

Par honnêteté, ce qui manque encore :

- **Le paiement en ligne.** L'intention de paiement est créée chez Stripe, mais
  le webhook qui confirme l'encaissement et le remboursement ne sont pas écrits :
  une commande reste en paiement « en attente ».
- **Les commandes en mode test**, pour qu'un commerçant s'entraîne sans polluer
  ses statistiques.
- **`/client/checkout`**, une troisième page de commande héritée, qui envoie un
  panier réparti sur plusieurs commerces dans un format que l'API n'accepte pas.
  Le tunnel de commande à jour est celui de la vitrine.
- **Deux vitrines pour la même chose** : `/restaurant/<id>` et `/store/<slug>`.
  Elles partagent le tunnel de commande mais pas leur habillage ; il faudrait
  n'en garder qu'une.
- **Le fond de carte** du suivi de livraison : le trajet est dessiné en repères,
  sans tuiles cartographiques.
- **Le stock par ingrédient** (une pizza consomme de la mozzarella). Aujourd'hui
  la disponibilité se bascule à la main, plat par plat.
- **Prisma 5.22 → 7**, à faire une fois le reste stabilisé.
- Ni file d'attente, ni hébergement d'images externe, ni remontée d'erreurs :
  les variables correspondantes sont commentées dans `.env.example`.

## Licence

Projet privé. Tous droits réservés.
