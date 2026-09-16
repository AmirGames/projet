# Vérifications du site

Ces scripts pilotent un **vrai navigateur** sur un site qui tourne. Ils
attrapent ce que les vérifications d'API ne voient pas : un lien mort, une
barre latérale en double, un bouton qui ne fait rien, un message d'erreur qui
ne s'affiche pas.

Les vérifications d'API, elles, sont dans `backend/scripts/verification/`.

## Ce qu'il faut avant

**Playwright** n'est pas une dépendance du projet : il ne sert qu'ici, et son
installation télécharge un navigateur.

```bash
cd frontend
npm i -D playwright
npx playwright install chromium
```

Puis, dans trois terminaux :

```bash
# 1. L'API, sur une base de test
cd backend
DATABASE_URL="postgresql://postgres:motdepasse@localhost:5432/saas_test" PORT=3099 npm run dev

# 2. Le jeu de démonstration
cd backend
node scripts/verification/reinitialiser.mjs
node scripts/seed-demo.mjs

# 3. Le site, branché sur cette API
cd frontend
NEXT_PUBLIC_API_URL=http://localhost:3099 npm run dev
```

## Lancer

```bash
cd frontend

VERIF_SITE_URL=http://localhost:3000 npm run verif:menu         # barre latérale du commerçant
VERIF_SITE_URL=http://localhost:3000 npm run verif:admin        # espace d'administration
VERIF_SITE_URL=http://localhost:3000 npm run verif:motdepasse   # mot de passe oublié
VERIF_SITE_URL=http://localhost:3000 npm run verif:courses      # proposition de course au livreur
VERIF_SITE_URL=http://localhost:3000 npm run verif:suivi        # suivi de livraison côté client
VERIF_SITE_URL=http://localhost:3000 npm run verif:menu-client  # ordre des produits et plats épuisés
VERIF_SITE_URL=http://localhost:3000 npm run verif:livreurs     # validation des dossiers livreurs
```

Trois scripts — `verif:courses`, `verif:suivi`, `verif:livreurs` — montent leur
propre décor et font valider un livreur par la plateforme. Ils supposent donc
une **base vierge** : le premier compte inscrit est le seul à être superowner.

```bash
cd backend && node scripts/verification/reinitialiser.mjs
```

| Variable | Rôle | Défaut |
|---|---|---|
| `VERIF_SITE_URL` | Adresse du site visé | `http://localhost:3000` |
| `VERIF_API_URL` | Adresse de l'API (parcours mot de passe) | `http://localhost:3001` |

## La répartition par domaine

`verif:domaines` a ses propres prérequis : le site doit tourner **avec les
trois domaines renseignés**, les mêmes que ceux passés au script.

```bash
NEXT_PUBLIC_DOMAINE_PUBLIC=monsite.local \
NEXT_PUBLIC_DOMAINE_PRO=commercant.monsite.local \
NEXT_PUBLIC_DOMAINE_LIVREUR=livreur.monsite.local \
npm run dev

# dans un autre terminal, les mêmes valeurs
NEXT_PUBLIC_DOMAINE_PUBLIC=monsite.local \
NEXT_PUBLIC_DOMAINE_PRO=commercant.monsite.local \
NEXT_PUBLIC_DOMAINE_LIVREUR=livreur.monsite.local \
npm run verif:domaines
```

Ce script-là n'a pas besoin de Playwright : il forge l'en-tête `Host`
directement, sans rien résoudre — inutile donc de toucher au fichier `hosts`
pour le lancer.

## Les fichiers

| Fichier | Couvre |
|---|---|
| `verif-domaines.mjs` | La répartition des pages entre les trois domaines |
| `verif-menu-merchant.mjs` | Le choix du commerce et sa barre latérale |
| `verif-espace-administration.mjs` | L'espace unique et les anciennes adresses |
| `verif-mot-de-passe-oublie.mjs` | Le parcours complet, courriel compris |
| `verif-courses-livreur.mjs` | Passage en ligne, proposition de course, acceptation |
| `verif-suivi-client.mjs` | Distance restante, durée estimée et avancement, côté client |
| `verif-menu-restaurant.mjs` | Ordre des produits et étiquette « Épuisé », côté client |
| `verif-creneaux-retrait.mjs` | Créneaux de retrait tenus aux horaires d'ouverture |
| `verif-declinaisons.mjs` | Déclinaisons d'un plat, des deux côtés |
| `verif-paniers.mjs` | Un panier par commerce, et ceux laissés ailleurs |
| `verif-zones-livraison.mjs` | Anneaux de livraison : réglage, frais, minimum |
| `verif-commande-invite.mjs` | Commander sans compte : adresse, zone, commande enregistrée |
| `verif-formules-pages.mjs` | Grille tarifaire et demande de changement de formule |
| `verif-cloche.mjs` | La cloche de notifications, partout où elle doit être |
| `verif-compte-restreint.mjs` | Compte suspendu ou fermé : tout bloqué sauf le support |

Le parcours mot de passe ouvre un serveur SMTP minimal sur le port 1025 pour
lire le message envoyé : le jeton n'existe en clair que dans ce lien, la base
n'en garde qu'une empreinte. Laissez ce port libre pendant l'exécution.

## La commande en invité

`verif:invite` a besoin d'un service d'adresses joignable : le client y tape son
adresse sans passer par une suggestion, et c'est le serveur qui la situe. Le faux
service du dépôt suffit, et évite de dépendre d'Internet.

```bash
# 1. le faux service, sur le port 4599
cd backend
node scripts/verification/faux-service-adresses.mjs &

# 2. l'API, tournée vers lui
ADDRESS_API_URL=http://127.0.0.1:4599/ban/ PORT=3099 npm run dev

# 3. la vérification
cd frontend
VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3099 npm run verif:invite
```
