# Zupone — connaissances du projet

Document de référence : ce qu'est le projet, comment on y travaille, ce qui a
été fait, et ce qui reste. À relire avant de reprendre le travail.

Dernière mise à jour : boutique située à la création, et adresses belges.

---

## 1. Le projet

**Zupone** est une plateforme de commande en ligne pour les commerces de
proximité, dans l'esprit d'Uber Eats ou Glovo. Trois métiers cohabitent :

- **le client** commande depuis la vitrine d'un commerce, avec ou sans compte ;
- **le commerçant** tient son catalogue, ses horaires, ses zones et ses commandes ;
- **le livreur** reçoit les courses et les mène à leur terme ;
- **la plateforme** (superowner) surveille l'ensemble, facture les commissions
  et valide les livreurs.

Plusieurs commerçants cohabitent sur la même installation, chacun chez lui
(multi-tenant). Restaurants, boulangeries, épiceries — tout commerce qui vend
à emporter ou à livrer.

**Noms de domaine réservés** : `zupone.com`, `zupeat.com`, `zupdrive.com`.
Le site sait se répartir sur trois domaines (public / commerçant / livreur) ou
tenir sur un seul. **Rien n'est déployé : tout se passe en local.**

---

## 2. Les règles de travail

Ces règles sont permanentes, elles ne se redemandent pas.

| Règle | Détail |
|---|---|
| **Langue** | Tout en français : réponses, code, commentaires, messages de commit, interfaces. |
| **Dépôt** | `https://github.com/AmirGames/projet` — le remote a tendance à revenir tout seul sur `AmirGames/saas-project`, qui est injoignable. **Vérifier `git remote set-url origin` avant chaque push.** |
| **Branche** | `claude/awesome-ride-m9lci8`, qui est aussi la branche par défaut du dépôt. `main` existe en double mais n'est plus suivie. |
| **Environnement** | Développement sous Windows (`C:\projet`), assistance dans un bac à sable Linux. |
| **Déploiement** | Aucun. Tout reste local tant que le site n'est pas fini. |

### Ce qui est volontairement reporté

- **Le paiement en ligne** (webhooks Stripe, remboursements) — « tant que le
  reste n'est pas fait ».
- **La migration Prisma 5.22 → 7** — « on termine tout le site et après on fait
  une migration ».
- **Le stock par ingrédient** (une pizza consomme de la mozzarella), abandonné
  au profit du simple bouton disponible / épuisé.

---

## 3. La pile technique

| | |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| **Backend** | Express, TypeScript, Prisma 5.22 |
| **Base de données** | PostgreSQL |
| **Temps réel** | Socket.IO — disponibilité des plats, notifications, suivi de livraison |
| **Authentification** | JWT (jeton d'accès + jeton de renouvellement) |
| **Courriel** | SMTP via nodemailer, Mailpit en développement |
| **Adresses** | BAN pour la France + Photon pour la Belgique (`ADDRESS_PROVIDER=ban+photon`) |
| **Paiement** | Stripe — intention de paiement seulement |

```
backend/    API REST — 37 routeurs, 43 services, 43 modèles Prisma
frontend/   Next.js — 82 pages
```

**Le premier compte inscrit devient la plateforme** (superowner). Tous les
suivants sont des commerçants ordinaires. Cette règle gouverne aussi les
scripts de vérification (voir §6).

---

## 4. Ce que fait la plateforme aujourd'hui

### Le client
- Parcourt les commerces, par recherche ou par proximité
- Menu rangé par catégories, plats épuisés signalés en direct
- Déclinaisons d'un plat (taille, type de pâtes…)
- **Un panier par commerce** : passer de l'un à l'autre ne mélange rien
- **Commande sans compte** : coordonnées, adresse de livraison avec suggestions,
  ou créneau de retrait tenu aux horaires réels
- Frais de livraison et minimum de commande annoncés **avant** de valider
- Code promo et choix du moyen de paiement au tunnel
- Suivi de la commande : distance restante, durée estimée, position du livreur
- **Code de remise** à quatre chiffres, donné au livreur à la porte
- Retrouve une commande passée sans compte par son lien de suivi

### Le commerçant
- Plusieurs boutiques par compte, selon la formule souscrite
- Catalogue : catégories et plats réordonnables au glisser-déposer,
  déclinaisons, disponibilité basculable en direct
- Commandes : liste, détail, changement d'état, facture imprimable
- Horaires, créneaux de retrait, ouverture et fermeture immédiate
- Zones de livraison en anneaux : rayon, frais et minimum par zone
- Codes promo, moyens de paiement, taxes, clientèle
- Statistiques de vente, exports
- Support par tickets avec fil de discussion

### Le livreur
- Inscription, puis **dossier examiné par la plateforme** : dépôt des pièces
  (identité, permis, assurance, carte grise — seule l'identité à vélo), suivi
  de leur examen, motif lisible en cas de refus
- **Tant que le dossier n'est pas validé, ni mise en ligne ni course proposée**
- Passage en ligne, position transmise
- Courses attribuées automatiquement au livreur disponible le plus proche
- Acceptation, refus, étapes de la course, rémunération calculée
- **Sait s'il est payé** : ce qui reste dû, ce qui est arrêté et attend le
  virement, ce qui est arrivé, et le détail de chaque relevé
- **Prouve la remise** : le code du client, ou la photo du dépôt en son absence

### La plateforme (superowner)
- Commerçants : formule, suspension, fermeture, restauration depuis sauvegarde
- Formules réglables : nom, prix, quota de boutiques, **commission sur les
  ventes**, arguments de vente
- Facturation : commission du mois par commerçant, avec le détail par commande
- **Boutiques** : une fiche par commerce, avec la correction des seuls champs
  dont la plateforme répond (voir la règle ci-dessous)
- **Livreurs** : dossiers à traiter, examen des pièces, validation, suspension,
  rétablissement — chaque geste motivé et journalisé
- **Versements** : ce qu'elle doit et à qui, arrêté des relevés d'une période,
  versement avec sa référence, annulation d'un relevé non versé
- Santé du système : cinq relevés chiffrés et la conduite à tenir
- Journal des actions et journal des accès (avec IP et durée réelles)
- Sauvegardes, mode maintenance, clés d'API, webhooks
- Support : tous les tickets, y compris archivés, réponses, priorités

---

## 5. Ce qui a été fait, par thème

Le dépôt porte environ 200 commits. Les premiers (en anglais) sont la
construction initiale ; le travail en français qui suit est un long effort de
**mise en vérité** : beaucoup de fonctionnalités existaient à l'écran ou dans le
schéma sans être réellement branchées.

### Le fil rouge

> **Le motif qui revient : une fonctionnalité est configurable mais n'est jamais
> appliquée.** Des prix de commande venaient du client et étaient crus sur
> parole. Une boutique fermée acceptait quand même les commandes. Les montants
> minimum et maximum se réglaient dans l'interface sans agir nulle part. Le
> modèle `DriverDocument` existait sans aucune route. Un livreur naissait
> `ACTIVE`. La commission était globale alors que les formules en annonçaient
> une par palier. La durée des requêtes était écrite en dur à `0`. L'IP n'était
> jamais enregistrée. Treize routes d'API renvoyaient des données inventées.
>
> **Réflexe à garder : ne jamais croire l'écran ni le schéma, vérifier que la
> règle s'applique vraiment, avec un script qui relit la donnée.**

### Les grands chantiers

**Espace commerçant**
Navigation groupée, sélecteur de boutique et pages qui suivent la boutique
choisie, tableau de bord réel, correction de huit pages qui envoyaient un
`orgId` là où l'API attendait un `storeId`, unité monétaire corrigée dans tout
le site, barre latérale réparée.

**Espace plateforme**
Les trois espaces d'administration (`/admin`, `/super-admin`, `/superowner`)
réunis sous `/superowner` avec redirections. Analytics, journal, support,
administrateurs, réglages rendus opérationnels. Clés d'API, webhooks,
sauvegardes (téléchargement, restauration, suppression), audit de sécurité,
mode maintenance réellement appliqué. Suppression des treize routes fictives.

**Formules et facturation**
Grille tarifaire sortie du code et rendue réglable, quota de boutiques appliqué,
formule visible et changeable côté commerçant, **commission par formule**
(8 / 5 / 3 %), détail des commandes derrière chaque ligne de facturation, bornes
minimum et maximum enfin appliquées à la commande.

**Catalogue et commande**
Disponibilité en direct via Socket.IO, ordre des produits respecté côté client,
catégories affichées, déclinaisons (avec calcul des prix côté serveur),
**un panier par commerce**, créneaux de retrait tenus aux horaires réels,
**commande en invité avec saisie de l'adresse**, zones de livraison réellement
appliquées, code promo et moyens de paiement au tunnel.

**Livraison**
Attribution automatique de la course au livreur disponible le plus proche,
suivi côté client (distance, durée, position), domaine propre aux livreurs,
puis **la validation des dossiers livreurs**, **les versements** — une course
livrée est due tant qu'aucun relevé ne la porte — et enfin **la preuve de la
remise** : un code à quatre chiffres chez le client, une photo du dépôt en son
absence.

**Comptes et sécurité**
Récupération de mot de passe, confirmation d'adresse e-mail, suspension et
fermeture de compte en direct, **cloisonnement des commerçants** (une boutique
n'accepte plus l'identifiant d'une autre), sessions périmées répondant un 401
explicite, erreurs de validation rendues en français plutôt qu'un
« Validation error » muet.

**Support**
Fil de discussion sur les tickets, cloche de notifications branchée partout,
archivage à la clôture, priorités, alerte de la plateforme à l'ouverture,
tickets archivés consultables et ré-ouvrables.

**Nettoyage des vitrines**
Le site portait **trois vitrines** pour la même chose — `/restaurant/<id>`,
`/client/restaurant/<id>`, `/store/<slug>` — plus une maquette `/store` à
l'identifiant écrit en dur, vers laquelle la page d'accueil pointait. Il n'en
reste qu'une, `/store/<slug>` ; les anciennes adresses redirigent. Le panier
global (`cart-context`) a disparu avec l'ancien tunnel `/client/checkout` :
seul `lib/paniers.ts`, un panier par commerce, subsiste.

**Infrastructure de vérification**
Les scripts de vérification versés dans le dépôt, un `README.md`, et le présent
document.

---

## 6. Comment on vérifie — le point le plus important

**Pas de tests unitaires à simulacres.** Le projet se vérifie avec :

- des **scripts qui interrogent une vraie API branchée sur une vraie base** ;
- des scripts qui **pilotent un vrai navigateur** (Playwright).

**Un contrôle n'affirme jamais un code HTTP : il relit la donnée pour vérifier
qu'elle a bougé.** C'est ce qui attrape les fonctionnalités en trompe-l'œil.

### Les totaux actuels

| | Suites | Contrôles |
|---|---|---|
| **API** (`backend/scripts/verification/`) | 34 | **1129** |
| **Navigateur** (`frontend/scripts/`) | 20 | **505** |

Tout est vert au dernier passage complet.

### Lancer

```bash
# API
cd backend
createdb zupone_test
DATABASE_URL="postgresql://.../zupone_test" npx prisma db push
DATABASE_URL="postgresql://.../zupone_test" PORT=3099 npm run dev   # un terminal
DATABASE_URL="postgresql://.../zupone_test" VERIF_API_URL=http://localhost:3099 npm run verif

# Navigateur
cd frontend
npm i -D playwright && npx playwright install chromium
VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3099 npm run verif:invite
```

`backend/scripts/verification/LISEZ-MOI.md` et `frontend/scripts/LISEZ-MOI.md`
détaillent chaque suite et ses prérequis.

> La base visée est **vidée** avant chaque script d'API. Un garde-fou refuse de
> s'exécuter si le nom de la base ne contient pas `test`.

### Prérequis particuliers

- **Base vierge** pour `verif:courses`, `verif:suivi`, `verif:livreurs`,
  `verif:versements`, `verif:preuve` et `verif:vitrine` : ces scripts créent leur propre compte
  plateforme, et seul le premier compte inscrit est superowner. Lancer
  `node scripts/verification/reinitialiser.mjs` avant.
- **Jeu de démonstration** pour `verif:admin` et `verif:menu` :
  `node scripts/seed-demo.mjs`.
- **Faux service d'adresses** pour `verif:invite` et tout ce qui géocode :
  `node backend/scripts/verification/faux-service-adresses.mjs &` puis
  `ADDRESS_API_URL=http://127.0.0.1:4599/ban/` côté API. **À arrêter avant la
  suite d'API** : `verif-adresses` ouvre son propre service sur le même port
  4599 et s'interrompt si celui-ci est occupé.
- **Trois domaines renseignés** pour `verif:domaines`
  (`NEXT_PUBLIC_DOMAINE_PUBLIC`, `_PRO`, `_LIVREUR`), les mêmes des deux côtés.

---

## 7. Pièges connus

Chacun a déjà coûté du temps. À relire avant d'écrire un script ou une route.

**Base et Prisma**
- Une base fraîche **n'a aucune ligne `SystemConfig`** : passer par
  `PUT /api/admin/config` (qui la crée), jamais par un `UPDATE` direct.
- Après tout changement de schéma, **`npx prisma db push` est obligatoire côté
  Windows** — sans lui, les écritures échouent en silence.

**Scripts de vérification**
- `sqlScalaire()` ne renvoie que **la première colonne**. Jamais
  `SELECT a, b` : faire deux appels.
- Le premier compte inscrit est le seul superowner (voir §6).

**Routes Express**
- **Les segments littéraux doivent être déclarés avant les routes
  paramétrées.** `/:storeId/:orderId` avale `/:storeId/today` s'il passe
  devant. Déjà rencontré sur `order-management` et `payment-method`.

**Formats attendus**
- La création de promotion veut `discountValue`, pas `value`.
- Les codes promo sont stockés **en majuscules**.
- `PaymentMethodType` : `CREDIT_CARD`, `DEBIT_CARD`, `PAYPAL`, `STRIPE`,
  `BANK_TRANSFER`, `CASH`, `APPLE_PAY`, `GOOGLE_PAY` — **pas de `CARD`**.
- La création de ticket attend `subject`, pas `title`.
- `Order` **n'a pas de `orderNumber`** : les commandes se désignent par leur
  `id`, que l'interface raccourcit à ses huit derniers caractères.

**Next.js**
- `useSearchParams()` dans un composant client impose une frontière `Suspense`
  au build. Lire `window.location.search` dans un `useEffect` à la place.
- Un commentaire JSX `{/* … */}` ne peut pas être **frère** de l'élément que
  rend une flèche : il casse la compilation. Le placer avant le `.map(…)`.
- **Ne jamais enregistrer un état avant de l'avoir lu.** Sur la vitrine, l'effet
  qui persiste le panier partait avant celui qui le relit, et écrasait le panier
  gardé du dernier passage. Un garde (`panierLu`) ordonne les deux.

**La vitrine (`/store/<slug>`)**
- Son panier est un **panneau replié** : un script qui veut lire ses lignes doit
  d'abord cliquer sur « Panier ».
- Elle titre ses catégories en `h2` et ses plats en `h3`, dans des `<section>`.

---

## 8. Ce qui est actif en ce moment

### Terminé et poussé

**Le plan de livraison en trois temps est terminé** : validation des livreurs,
versements, preuve de la remise. Tout est vert et poussé.

Deux invariants à ne jamais casser :

- **Une course livrée est due tant qu'aucun relevé ne la porte.** Le champ
  `OrderDelivery.payoutId` interdit qu'une course soit payée deux fois : un
  arrêté ne prend que les courses qui n'en ont pas, et l'annulation d'un relevé
  non versé les relâche.
- **La plateforme ne corrige d'une boutique que l'adresse et ses coordonnées,
  l'adresse publique, le téléphone et l'e-mail.** Le nom, le catalogue, les
  prix et les horaires appartiennent au commerçant : c'est lui qui répond de ce
  que paie un client. Tout autre champ est refusé explicitement, chaque
  correction part au journal avec son avant et son après, et le commerçant est
  prévenu.
- **Le code de remise appartient au client, jamais au livreur.** Aucune route
  côté livreur ne le rend ; il sait seulement qu'un code est attendu et combien
  d'essais lui restent. Cinq essais ratés le bloquent, et la photo du dépôt
  devient la seule preuve possible.

### À faire ensuite

Plus rien de la livraison. Le carnet qui reste est ci-dessous — le plus gros
morceau étant le paiement en ligne, reporté volontairement.

### Le reste du carnet

- **Le paiement en ligne.** L'intention de paiement est créée chez Stripe, mais
  le webhook qui confirme l'encaissement et le remboursement ne sont pas
  écrits : une commande reste en paiement « en attente ». *Reporté
  volontairement.*
- **Les commandes en mode test**, pour qu'un commerçant s'entraîne sans polluer
  ses statistiques.
- **Le fond de carte** du suivi de livraison : le trajet est dessiné en
  repères, sans tuiles cartographiques.
- **Prisma 5.22 → 7.10**, une fois le reste stabilisé. *Reporté volontairement.*
- Ni file d'attente, ni hébergement d'images externe, ni remontée d'erreurs :
  les variables correspondantes sont commentées dans `.env.example`.

---

## 9. Conventions d'écriture

Elles se lisent dans le code existant, mais autant les dire.

- **Tout en français**, y compris les noms de variables et de fonctions dans le
  code récent (`piecesAttendues`, `validerLivreur`, `dossierComplet`).
- **Les commentaires disent pourquoi, pas quoi.** Ils expliquent le défaut
  qu'on répare ou le piège qu'on évite, jamais ce que la ligne fait déjà voir.
- **Les messages de commit racontent le problème**, pas la liste des fichiers :
  ce qui n'allait pas, ce qui change, ce que ça coûte.
- **Chaque chantier apporte sa suite de vérifications**, et les suites
  existantes doivent rester vertes.
