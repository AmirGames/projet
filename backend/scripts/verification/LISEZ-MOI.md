# Vérifications

Ces scripts interrogent une **vraie API branchée sur une vraie base**. Ils
attrapent ce qu'une relecture laisse passer : un champ mal nommé, une route qui
répond `200` sans rien faire, un montant divisé par cent, une permission qui ne
protège rien.

## Lancer

```bash
cd backend
npm run verif
```

Une seule suite :

```bash
npm run verif -- formules      # ne joue que verif-formules.mjs
npm run verif -- livreur
```

## Ce qu'il faut avant

**Une API démarrée** et **une base de test dédiée**.

```bash
# 1. Une base à part, jamais celle de développement
createdb saas_test

# 2. Le schéma
DATABASE_URL="postgresql://postgres:motdepasse@localhost:5432/saas_test" npx prisma db push

# 3. L'API sur un port à part
DATABASE_URL="postgresql://postgres:motdepasse@localhost:5432/saas_test" PORT=3099 npm run dev

# 4. Les vérifications, dans un autre terminal
DATABASE_URL="postgresql://postgres:motdepasse@localhost:5432/saas_test" VERIF_API_URL=http://localhost:3099 npm run verif
```

| Variable | Rôle | Défaut |
|---|---|---|
| `VERIF_API_URL` | Adresse de l'API visée | `http://localhost:3001` |
| `DATABASE_URL` | Base visée — **elle sera vidée** | (obligatoire) |
| `VERIF_AUTORISER_RESET` | `oui` pour lever le garde-fou du nom de base | (absent) |

## La base est vidée à chaque script

Tous les scripts partent du même postulat : **le premier compte inscrit devient
la plateforme**. Sans remise à zéro, la deuxième exécution échoue partout avec
des « Accès refusé » qui ressemblent à des régressions sans en être une.

`tout.mjs` vide donc la base avant *chaque* script, pas une fois au départ.

**Garde-fou :** la remise à zéro refuse de s'exécuter si le nom de la base ne
contient pas `test`. Pour passer outre — en connaissance de cause —
`VERIF_AUTORISER_RESET=oui`.

Ne visez jamais votre base de développement. Elle serait vidée.

## Lire la sortie

Un script qui passe n'affiche qu'une ligne de résumé. Un script qui échoue
déroule toute sa sortie, puis la liste des contrôles tombés. Le code de sortie
vaut `0` si tout passe, ce qui permet de brancher la suite sur une intégration
continue.

## Les fichiers

| Fichier | Couvre |
|---|---|
| `outils.mjs` | Tuyauterie commune : contrôles, appels HTTP, accès base |
| `reinitialiser.mjs` | Vidage de la base, avec son garde-fou |
| `tout.mjs` | Enchaîne les suites et rend un bilan unique |
| `boite-aux-lettres.mjs` | Serveur SMTP minimal, pour lire les courriels envoyés |
| `faux-service-adresses.mjs` | Faux fournisseur d'adresses, aux deux formats |
| `audit-commercant.mjs` | Chaque fonctionnalité de l'espace commerçant |
| `audit-superowner.mjs` | Chaque fonctionnalité de l'espace superowner, et ses effets réels |
| `verif-admin-final.mjs` | Journal d'accès, annonces, tickets, notifications |
| `verif-adresses.mjs` | Les deux fournisseurs d'adresses, le filtre par pays et le repli |
| `verif-admin-motdepasse.mjs` | Création d'administrateur et réparation des mots de passe en clair |
| `verif-attribution.mjs` | Attribution des courses : position, proposition, refus, rémunération |
| `verif-client.mjs` | Historique, suivi de livraison, avis, favoris |
| `verif-creneaux-tickets.mjs` | Créneaux de retrait tenus aux horaires, alerte d'ouverture de ticket |
| `verif-compte-restreint.mjs` | Suspension et fermeture : tout bloqué, sauf le support |
| `verif-compte-email.mjs` | Mot de passe oublié et confirmation d'adresse, courriel compris |
| `verif-declinaisons.mjs` | Déclinaisons d'un plat, et le prix d'une ligne calculé par le serveur |
| `verif-disponibilite.mjs` | Bouton disponible / épuisé |
| `verif-formules.mjs` | Formules, quotas de boutiques, service d'adresses |
| `verif-grille-formules.mjs` | Grille tarifaire réglable, quotas appliqués, demande de changement |
| `verif-livreur-admin.mjs` | Espace livreur et liste des boutiques côté administration |
| `verif-menu-client.mjs` | L'ordre du menu et les plats épuisés, tels que le client les reçoit |
| `verif-pages-marchand.mjs` | Les routes appelées par les pages commerçant |
| `verif-phase11.mjs` | Sauvegardes, mode maintenance, et les points signalés en revue |
| `verif-restauration.mjs` | Qu'une sauvegarde restaure des données réellement perdues |
| `verif-sante-systeme.mjs` | La santé système : ses cinq relevés, et ce qui la fait bouger |
| `verif-salons-direct.mjs` | Qui peut suivre quoi en direct, et la disponibilité poussée |
| `verif-temps-reel.mjs` | Notifications poussées en direct |

## Ajouter une vérification

Un nouveau fichier `.mjs` dans ce dossier est ramassé automatiquement.

```js
// Ce que couvre ce script, en une phrase.
import { titre, check, j, uniq, post, get, terminer } from './outils.mjs';

const compte = await j(await post('/api/auth/signup', {
  email: `x-${uniq}@test.fr`, password: 'Password123!', name: `X ${uniq}`,
}));

titre('Ce que je vérifie');
check('description au présent', compte?.accessToken !== undefined, JSON.stringify(compte));

await terminer();
```

Deux règles qui font la valeur de ces scripts :

- **Un contrôle affirme un effet, pas un code HTTP.** `status === 200` ne dit
  pas que la donnée a été écrite. Relisez-la.
- **Le troisième argument sert au diagnostic.** Il n'est affiché qu'en cas
  d'échec : mettez-y ce qui vous manquerait pour comprendre.
