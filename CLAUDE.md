# CLAUDE.md

Ce fichier fournit les règles et le contexte nécessaires à Claude Code pour travailler sur le dépôt **ZupEat**, première plateforme opérationnelle du groupe **ZupOne**.

> **Règle principale :** avant toute modification importante, comprendre l'architecture existante, les règles métier et les dépendances entre domaines. Ne pas réécrire ou simplifier une partie du système sans vérifier ses impacts.

---

# 1. Projet

## ZupOne

**ZupOne** est le groupe / écosystème auquel appartiennent les différentes plateformes.

ZupOne n'est pas la plateforme de commande elle-même.

## ZupEat

**ZupEat** est la plateforme de commande en ligne multi-commerçants.

Elle permet :

* au client de découvrir un commerce ;
* de consulter son catalogue ;
* de commander avec ou sans compte ;
* de payer en ligne ;
* au commerçant de gérer son établissement ;
* au commerçant de gérer son catalogue ;
* au commerçant de traiter ses commandes ;
* d'affecter / suivre une livraison ;
* au livreur de recevoir et réaliser une course ;
* à l'administration de superviser la plateforme ;
* de gérer les paiements et reversements.

## ZupDrive

ZupDrive est le domaine lié à la gestion des chauffeurs avoir une  licence LVC ou licence pour transport rémunéré de personnes

Marche a suivre pour ZupDrive

1. Inscrivez-vous en ligne pour créer un compte zupdrive.


2. Enregistrez votre entreprise et demandez un numéro de TVA auprès de la Banque Carrefour des Entreprises (BCE)
    Prenez un rendez-vous auprès d'un gichet d'entreprise et obtenez votre numéro d'entreprise. Faites la demande pour un numéro de TVA auprès d'un guichet d'entreprise compétent via un formulaire.

    Durée: 1 à 3 semaines
    Coût: 89,5 EUR

- Enregistrez votre entreprise à BCE

3. Trouvez un véhicule qui répond aux exigences
    Obtenez une assurance voiture professionnelle. Pour obtenir votre licence, vous devrez avoir une assurance qui couvre le transport rémunéré.

    Temps nécessaire: quelques semaines
    Coût: dépend de la voiture et du risque du partenaire

    Obtenir une plaque d'immatriculation T-X (Flandre) ou T-L (Bruxelles et Wallonie): 35 EUR

    Exigences du véhicule

4. Faire la demande de licence LVC ou licence pour transport rémunéré de personnes
    Une fois que vous possédez le véhicule, l'assurance et le numéro de TVA, vous pouvez faire la demande de licence LVC ou licence pour transport rémunéré de personnes:

        Bruxelles: Bruxelles Mobilité (650€/an)

        Wallonie: SPF Mobilité et Transport (350€/an)

        Flandre: Commune (250-350€/an) 


5. Téléchargez ces documents via l'application ou le site Internet drive.zupdrive.com:
    Téléchargez ces documents via l'application ou le site Internet drive.zupdrive.com:

        Carte d'identité
        Bestuuderspas (Flandre)
        Permis de conduire avec séléction médicale
        Numéro de TVA
        Une licence LVC ou un vergunning voor individueel bezoldigd personenvervoer
        Document de contrôle technique
        Assurance automobile pour transport rémunéré
        Certificat d'immatriculation (recto/verso)
        Documents d'identité de toutes personnes possédant des parts dans la société
        Extrait de casier judiciaire (Bruxelles)
        Des documents supplémentaires peuvent être requis en fonction de votre licence.

Architecture prévue :

* `zupdrive.com`
* `manager.zupdrive.com`
* `driver.zupdrive.com`

## Domaines

Architecture actuelle/prévue :

```text
zupone.com
└── manager.zupone.com

zupeat.com
├── manager.zupeat.com
└── delivery.zupeat.com

zupdrive.com
├── manager.zupdrive.com
└── driver.zupdrive.com
```

Ne pas créer arbitrairement de nouveaux domaines, sous-domaines ou espaces applicatifs sans vérifier l'architecture globale.

---

# 2. Langue et conventions

La documentation, les commentaires et les noms métier sont majoritairement en **français**.

Conserver cette convention.

Les noms techniques imposés par les frameworks ou bibliothèques peuvent rester en anglais.

Exemples :

```text
merchant
store
order
payment
driver
delivery
webhook
```

Les concepts métier spécifiques peuvent être documentés en français.

---

# 3. Architecture générale

Le projet est organisé en plusieurs applications.

```text
backend/
frontend/
mobile/
deploy/
*.md
```

## Backend

```text
backend/
└── src/
    ├── modules/
    ├── middleware/
    ├── config/
    ├── services/
    └── utils/
```

Stack principale :

* Node.js
* Express
* TypeScript
* Prisma
* PostgreSQL
* Redis
* Jest
* Zod
* esbuild

API :

```text
http://localhost:3001
```

## Frontend

Stack :

* Next.js 16
* App Router
* React 19
* Tailwind CSS 3
* next-intl

Frontend :

```text
http://localhost:3000
```

## Mobile

Applications Expo :

```text
mobile/apps/customer
mobile/apps/delivery
mobile/apps/merchant
```

Chaque application mobile possède ses propres règles et doit être consultée avant modification importante.

---

# 4. Documentation à lire avant modification

Avant toute modification importante, consulter les documents concernés.

Backend :

```text
backend/ARCHITECTURE.md
```

Frontend :

```text
frontend/ARCHITECTURE.md
```

Documentation métier :

```text
CONNAISSANCES-PROJET.md
```

Consulter également les documents concernant :

* paiements ;
* webhooks ;
* comptabilité ;
* déploiement ;
* livraison ;
* sécurité ;
* architecture ;
* base de données.

Ne jamais considérer un fichier isolé comme représentant toute l'architecture.

---

# 5. Architecture backend

Le backend est organisé **par domaine métier**, et non par type de fichier.

Exemple :

```text
src/modules/orders/
├── routes
├── services
├── jobs
├── middlewares
└── tests
```

Domaines existants ou prévus :

```text
auth
merchants
stores
catalog
orders
payments
payouts
delivery
drivers
realtime
superowner
```

D'autres domaines peuvent exister dans le projet.

## Principe

Une route doit rester mince :

```text
HTTP
 ↓
validation Zod
 ↓
auth / autorisation
 ↓
service métier
 ↓
Prisma / infrastructure
 ↓
réponse
```

La logique métier ne doit pas être placée directement dans les routes.

---

# 6. Services métier

Les services doivent contenir la logique métier.

Éviter :

```text
route → énorme logique métier → Prisma
```

Préférer :

```text
route
  ↓
validation
  ↓
service
  ↓
repository / Prisma
```

Une modification métier importante doit être centralisée afin d'éviter des comportements différents selon les routes.

---

# 7. Multi-tenant / cloisonnement des données

ZupEat est une plateforme **multi-commerçants**.

Le cloisonnement des données est une règle critique.

Un utilisateur ne doit jamais pouvoir accéder ou modifier les données d'un autre commerçant simplement en modifiant :

```text
id
storeId
merchantId
orderId
userId
```

Exemple :

```text
GET /orders/123
```

ne signifie jamais que l'utilisateur peut consulter `order 123`.

Le backend doit vérifier que la ressource appartient réellement au contexte autorisé.

Toujours appliquer le principe :

> **Chacun chez soi.**

Cela doit être vérifié côté serveur, même si le frontend masque déjà les données.

Ne jamais faire confiance :

* au frontend ;
* aux paramètres envoyés par le client ;
* aux IDs envoyés par l'utilisateur ;
* aux rôles déclarés côté frontend.

---

# 8. Authentification et autorisation

Les rôles doivent être contrôlés côté backend.

Exemples de contextes :

```text
customer
merchant
store manager
delivery
driver
superowner
```

Une authentification valide ne signifie pas automatiquement qu'une action est autorisée.

Toujours distinguer :

```text
Authentication
= Qui es-tu ?

Authorization
= As-tu le droit de faire cela ?
```

Pour chaque endpoint sensible, vérifier :

1. identité ;
2. rôle ;
3. appartenance à la ressource ;
4. état métier ;
5. permissions nécessaires.

---

# 9. Administration

Les actions d'administration qui modifient des données doivent être journalisées.

Utiliser :

```text
journaliser(...)
```

Le journal doit permettre de comprendre :

* qui a effectué l'action ;
* quelle action a été effectuée ;
* sur quelle ressource ;
* quand ;
* et, lorsque nécessaire, les anciennes / nouvelles valeurs.

Ne pas supprimer ou contourner la journalisation pour simplifier une implémentation.

---

# 10. Commandes

Une commande est un objet métier critique.

Une commande peut impliquer :

```text
client
 ↓
panier
 ↓
commande
 ↓
paiement
 ↓
confirmation
 ↓
commerçant
 ↓
préparation
 ↓
livraison
 ↓
livreur
 ↓
terminée
```

Les transitions d'état doivent être contrôlées.

Ne jamais permettre une transition impossible simplement parce qu'un endpoint est appelé directement.

Exemple :

```text
commande annulée
```

ne doit pas pouvoir redevenir :

```text
commande payée
```

sans règle métier explicitement prévue.

Les états et transitions existants doivent être respectés avant d'en ajouter de nouveaux.

---

# 11. Paiements Stripe

Les paiements Stripe sont critiques.

Le frontend ne doit jamais être considéré comme la source de vérité pour confirmer un paiement.

La confirmation finale doit être basée sur les mécanismes serveur prévus, notamment les **webhooks Stripe**.

Flux conceptuel :

```text
Client
 ↓
création commande
 ↓
Stripe
 ↓
paiement
 ↓
Stripe webhook
 ↓
backend
 ↓
validation
 ↓
commande confirmée
```

Ne jamais faire :

```text
frontend → "payment successful" → commande payée
```

sans validation serveur.

## Webhooks

Les webhooks doivent être :

* authentifiés / vérifiés ;
* idempotents ;
* résistants aux doublons ;
* résistants aux appels hors ordre ;
* correctement journalisés ;
* capables de gérer les retries.

Un même événement Stripe peut être reçu plusieurs fois.

Le traitement doit donc être conçu pour être exécuté plusieurs fois sans créer plusieurs effets métier.

---

# 12. Argent et montants

Les montants financiers sont critiques.

Ne pas utiliser des calculs flottants naïfs pour les montants monétaires.

Privilégier une représentation entière dans la plus petite unité appropriée :

```text
EUR 10,99
↓
1099 cents
```

Toujours documenter clairement :

```text
currency
amount
fees
taxes
commission
merchant amount
delivery amount
platform amount
```

Ne jamais arrondir arbitrairement un montant financier.

Les règles d'arrondi doivent être explicites et cohérentes.

---

# 13. Payouts / reversements

Les reversements commerçants doivent rester séparés de la logique de commande.

Architecture métier :

```text
Order
 ↓
Payment
 ↓
Financial transaction
 ↓
Payout
```

Les virements SEPA hebdomadaires ne doivent pas être considérés comme une simple modification du solde commerçant.

Conserver une traçabilité des mouvements financiers.

Ne jamais supprimer un mouvement financier déjà enregistré pour "corriger" une erreur.

Préférer :

```text
nouvelle opération corrective
```

plutôt que modifier silencieusement l'historique.

---

# 14. Base de données / Prisma

Prisma est utilisé comme ORM.

Version cible du projet :

```text
Prisma Client 7.10.0
```

Avant toute modification de :

```text
prisma/schema.prisma
```

identifier :

* migrations concernées ;
* données existantes ;
* contraintes ;
* relations ;
* index ;
* impacts backend ;
* impacts frontend ;
* impacts mobile.

Après modification du schéma :

```bash
npx prisma migrate dev
```

Ne jamais modifier manuellement une base de production pour contourner une migration sans procédure documentée.

---

# 15. Transactions

Lorsqu'une opération modifie plusieurs données qui doivent rester cohérentes, utiliser une transaction Prisma lorsque nécessaire.

Exemple :

```text
commande
+
paiement
+
stock
+
journal
```

Si une étape échoue, le système ne doit pas rester dans un état incohérent.

Attention toutefois aux appels externes dans une transaction longue :

```text
Stripe
API externe
email
push notification
```

Préférer lorsque nécessaire :

```text
transaction DB
 ↓
commit
 ↓
job / événement
 ↓
service externe
```

---

# 16. Redis

Redis peut être utilisé pour :

* cache ;
* sessions / données temporaires ;
* rate limiting ;
* jobs ;
* temps réel ;
* verrous distribués lorsque nécessaire.

Ne jamais considérer Redis comme la source de vérité pour les données métier critiques lorsque PostgreSQL doit les conserver durablement.

---

# 17. Jobs et tâches asynchrones

Les tâches de fond doivent être conçues pour supporter :

* retries ;
* doublons ;
* interruptions ;
* redémarrage du serveur.

Un job ne doit pas provoquer plusieurs fois une opération financière ou métier critique.

Utiliser l'idempotence lorsque nécessaire.

---

# 18. Temps réel

Les fonctionnalités temps réel doivent rester découplées de la logique métier principale.

Exemple :

```text
Order updated
 ↓
backend
 ↓
persist DB
 ↓
event
 ↓
realtime
 ↓
frontend/mobile
```

Le temps réel ne doit pas être la source de vérité.

Si une notification temps réel est perdue, le client doit pouvoir récupérer l'état réel depuis l'API.

---

# 19. Frontend

Le frontend utilise :

* Next.js 16 ;
* App Router ;
* React 19 ;
* Tailwind CSS ;
* next-intl.

Cette version de Next.js comporte des changements importants.

Avant de modifier le routage, consulter la documentation présente dans :

```text
frontend/node_modules/next/dist/docs/
```

Ne pas appliquer automatiquement des solutions prévues pour d'anciennes versions de Next.js.

---

# 20. Espaces frontend

Le frontend est séparé en différents espaces fonctionnels :

```text
client / vitrine
merchant
delivery
superowner
```

Chaque espace doit respecter :

* son authentification ;
* ses permissions ;
* ses données ;
* son routing ;
* ses traductions ;
* son UI.

Ne pas mélanger la logique métier des différents espaces sans raison.

---

# 21. Internationalisation

Les traductions sont stockées dans :

```text
frontend/messages/
```

Utiliser `next-intl`.

Ne pas hardcoder du texte utilisateur directement dans les composants lorsque le texte doit être traduit.

Exemple à éviter :

```tsx
<button>Commander</button>
```

Préférer le système de traduction du projet.

---

# 22. Sécurité frontend

Le frontend ne constitue jamais une frontière de sécurité.

Les vérifications importantes doivent exister côté backend.

Ne jamais exposer :

* secrets ;
* clés privées ;
* variables serveur ;
* credentials ;
* secrets Stripe ;
* credentials PostgreSQL ;
* tokens internes.

Une variable destinée uniquement au serveur ne doit pas devenir :

```text
NEXT_PUBLIC_...
```

sans justification explicite.

---

# 23. Validation des données

Toute donnée provenant de l'extérieur doit être considérée comme non fiable.

Sources concernées :

* body ;
* query ;
* params ;
* headers ;
* cookies ;
* fichiers ;
* webhooks ;
* applications mobiles ;
* frontend.

Utiliser Zod ou le mécanisme de validation prévu par le projet.

Ne pas faire confiance au typage TypeScript pour sécuriser les données runtime.

---

# 24. Erreurs

Utiliser :

```text
ApiError
```

pour les erreurs métier/API prévues.

Ne pas exposer les erreurs internes au client.

Éviter :

```text
res.status(500).json(error)
```

lorsque `error` contient des informations internes.

Les logs peuvent contenir davantage de détails, mais doivent eux aussi éviter les secrets.

---

# 25. Logs

Ne jamais logger :

* mot de passe ;
* token ;
* secret ;
* clé API privée ;
* données bancaires sensibles ;
* informations confidentielles inutiles.

Les logs doivent permettre de diagnostiquer un problème sans exposer les secrets.

---

# 26. Rate limiting / abus

Les endpoints sensibles doivent être protégés contre les abus lorsque nécessaire.

Particulièrement :

```text
login
register
password reset
OTP
payment
webhooks
admin
création de commandes
```

Ne pas ajouter un rate limit arbitraire sans vérifier son impact sur les applications mobiles et le fonctionnement réel du système.

---

# 27. CORS et réseau

En développement :

```text
Frontend : 3000
Backend  : 3001
```

Les configurations CORS / `allowedDevOrigins` doivent être vérifiées avant modification.

Ne pas autoriser :

```text
*
```

en production pour simplifier un problème CORS.

Les origines autorisées doivent être explicites.

---

# 28. Variables d'environnement

Ne jamais committer :

```text
.env
.env.local
.env.production
```

ou des secrets équivalents.

Les variables d'environnement doivent être documentées dans un exemple :

```text
.env.example
```

mais les vraies valeurs secrètes ne doivent jamais y être placées.

Lorsqu'une nouvelle variable est ajoutée :

1. l'ajouter au système de validation de configuration ;
2. documenter son rôle ;
3. ajouter sa présence dans `.env.example` si approprié ;
4. vérifier le développement ;
5. vérifier le build ;
6. vérifier le déploiement.

---

# 29. Tests

Une fonctionnalité importante doit être testée à plusieurs niveaux lorsque nécessaire.

## Tests unitaires

```bash
npm test
```

ou :

```bash
npx jest chemin/du/fichier.test.ts -t "nom du test"
```

## TypeScript

```bash
npx tsc --noEmit
```

## Lint

```bash
npm run lint
```

## Build

```bash
npm run build
```

## Vérifications E2E

Les scripts :

```text
scripts/verif-*.mjs
```

servent à vérifier le comportement réel contre le frontend et l'API.

Une fonctionnalité importante doit idéalement disposer d'une vérification E2E.

Exemple :

```text
VERIF_SITE_URL=http://localhost:3000
VERIF_API_URL=http://localhost:3001
node scripts/verif-<nom>.mjs
```

Les vérifications E2E doivent tester les comportements utilisateur réels et pas seulement vérifier que l'API répond HTTP 200.

---

# 30. Commandes de développement

## Démarrage global

Services :

```text
PostgreSQL : 5432
Redis      : 6379
Mailpit    : 8025
```

Démarrage :

```bash
./start.sh
```

Arrêt :

```bash
./stop.sh
```

## Backend

```bash
cd backend

npm run dev

npx tsc --noEmit

npm run build

npm test

npm run lint

npx prisma migrate dev

npm run create-superowner
```

## Frontend

```bash
cd frontend

npm run dev

npx tsc --noEmit

npm run lint

npm run build
```

## Mobile

Dans chaque application :

```bash
npm start
npm run lint
```

---

# 31. Règles de modification

Avant de modifier du code :

1. Identifier le domaine concerné.
2. Lire son architecture.
3. Chercher les appels existants.
4. Chercher les tests existants.
5. Vérifier les relations Prisma.
6. Vérifier les permissions.
7. Vérifier les impacts frontend/mobile.
8. Vérifier les migrations éventuelles.
9. Vérifier les événements/webhooks/jobs.
10. Modifier le minimum nécessaire.

Ne pas faire de refactor massif lorsqu'une correction locale suffit.

---

# 32. Ne pas supprimer du code sans preuve

Avant de supprimer :

* route ;
* service ;
* modèle Prisma ;
* champ ;
* endpoint ;
* composant ;
* hook ;
* job ;
* migration ;
* variable d'environnement ;

chercher d'abord toutes ses références.

Une fonctionnalité apparemment inutilisée peut être utilisée par :

* mobile ;
* scripts ;
* cron ;
* webhook ;
* frontend ;
* déploiement ;
* intégration externe.

---

# 33. Imports

Importer les fichiers explicitement.

Éviter les `index.ts` servant uniquement de barrel exports lorsque cela peut provoquer :

* cycles ;
* imports inutiles ;
* problèmes Jest ;
* difficulté de navigation.

Lorsqu'un fichier est déplacé, vérifier les :

```text
jest.mock(...)
```

et tous les imports relatifs.

---

# 34. Utils

Les utilitaires génériques doivent rester indépendants.

```text
utils/
```

ne doit pas importer directement un module métier.

Éviter :

```text
utils → orders
utils → merchants
utils → payments
```

Les dépendances doivent aller dans le sens :

```text
infrastructure
        ↑
      métier
        ↑
       route
```

et éviter les dépendances circulaires.

---

# 35. Architecture mobile

Les applications mobiles doivent communiquer avec l'API centrale.

Architecture conceptuelle :

```text
Customer App
      │
Merchant App
      │
Delivery App
      │
      ▼
   ZupEat API
      │
      ▼
PostgreSQL / Redis
```

Les applications mobiles ne doivent pas accéder directement à PostgreSQL.

Les règles de sécurité du backend restent applicables aux clients mobiles.

Ne jamais considérer une application mobile comme une application de confiance.

---

# 36. Notifications

Les notifications :

* email ;
* push ;
* temps réel ;

ne doivent pas remplacer l'état métier enregistré en base.

Exemple :

```text
Commande confirmée
```

doit être vrai en base avant d'envoyer une notification :

```text
Votre commande est confirmée.
```

Une notification échouée ne doit pas annuler une opération métier déjà validée.

---

# 37. Idempotence

Toute opération pouvant être répétée doit être examinée sous l'angle de l'idempotence.

Particulièrement :

```text
Stripe webhook
paiement
création de commande
payout
jobs
notifications
affectation livraison
```

Question à se poser avant chaque implémentation :

> Que se passe-t-il si cette requête est reçue deux fois ?

Le résultat doit être maîtrisé.

---

# 38. États métier

Avant d'ajouter un nouvel état :

1. rechercher les états existants ;
2. rechercher toutes les transitions ;
3. rechercher les conditions associées ;
4. vérifier le frontend ;
5. vérifier le mobile ;
6. vérifier les jobs ;
7. vérifier les notifications ;
8. vérifier les statistiques ;
9. vérifier les paiements / reversements.

Ne pas créer plusieurs noms pour représenter le même état.

---

# 39. API

Lorsqu'un endpoint est ajouté ou modifié :

Documenter ou vérifier :

```text
méthode HTTP
route
authentification
rôle
permissions
params
query
body
réponse
erreurs
effets secondaires
```

Une modification breaking d'une API doit être identifiée explicitement.

Avant de modifier une réponse existante, rechercher ses consommateurs :

```text
frontend
mobile/customer
mobile/merchant
mobile/delivery
scripts
```

---

# 40. Déploiement

Le déploiement utilise l'infrastructure documentée dans :

```text
deploy/
```

Avant toute modification de déploiement, vérifier :

* variables d'environnement ;
* migrations ;
* build ;
* ports ;
* reverse proxy ;
* HTTPS ;
* services ;
* health checks ;
* logs ;
* rollback.

Une modification locale qui fonctionne sur Windows/Docker ne doit pas être considérée comme automatiquement compatible avec la production.

---

# 41. Workflow recommandé

Pour une nouvelle fonctionnalité :

```text
1. Comprendre le besoin
        ↓
2. Identifier le domaine
        ↓
3. Lire l'architecture
        ↓
4. Vérifier le modèle Prisma
        ↓
5. Vérifier les permissions
        ↓
6. Implémenter le service métier
        ↓
7. Ajouter/modifier la route
        ↓
8. Ajouter les tests
        ↓
9. Ajouter le frontend/mobile
        ↓
10. Ajouter une vérification E2E si importante
        ↓
11. Typecheck
        ↓
12. Lint
        ↓
13. Tests
        ↓
14. Build
        ↓
15. Vérifier les impacts
```

---

# 42. Workflow recommandé pour un bug

Ne pas corriger uniquement le symptôme.

Chercher :

```text
cause
 ↓
impact
 ↓
correction
 ↓
test de non-régression
```

Pour un bug critique :

```text
Reproduire
 ↓
Identifier la cause
 ↓
Corriger
 ↓
Ajouter un test
 ↓
Vérifier les scénarios voisins
```

---

# 43. Avant de déclarer une tâche terminée

Ne jamais considérer une tâche terminée simplement parce que le code compile.

Vérifier lorsque pertinent :

```text
[ ] TypeScript
[ ] Lint
[ ] Tests
[ ] Build
[ ] API
[ ] Permissions
[ ] Multi-tenant
[ ] Base de données
[ ] Frontend
[ ] Mobile
[ ] Webhooks
[ ] Jobs
[ ] Paiements
[ ] Logs
[ ] Sécurité
[ ] E2E
```

Pour une fonctionnalité financière :

```text
[ ] montant
[ ] devise
[ ] arrondi
[ ] idempotence
[ ] webhook
[ ] historique
[ ] payout
[ ] rollback / correction
```

---

# 44. Règles absolues

Ne jamais :

* contourner l'autorisation backend ;
* faire confiance au frontend pour une règle de sécurité ;
* considérer Stripe frontend comme source de vérité ;
* exposer un secret ;
* supprimer une donnée financière pour corriger l'historique ;
* permettre l'accès aux données d'un autre commerçant ;
* modifier une migration déjà appliquée sans procédure adaptée ;
* supprimer du code sans rechercher ses références ;
* ajouter une dépendance sans vérifier son utilité ;
* ajouter une architecture parallèle alors qu'une architecture existante répond déjà au besoin ;
* effectuer un gros refactor sans nécessité ;
* déclarer une fonctionnalité terminée sans validation appropriée.

---

# 45. Philosophie du projet

ZupEat doit rester :

```text
simple
modulaire
sécurisé
testable
maintenable
évolutif
```

La priorité est :

```text
correctness
> sécurité
> cohérence métier
> maintenabilité
> performance
> simplicité
```

La performance ne doit jamais être obtenue au prix de l'intégrité des données ou de la sécurité.

Lorsqu'une décision technique est ambiguë, privilégier la solution qui :

1. respecte l'architecture existante ;
2. limite les effets de bord ;
3. conserve les données ;
4. protège les permissions ;
5. est testable ;
6. reste compréhensible pour un autre développeur.

---

# 46. Résumé de l'écosystème

 Ca évolura au fur et a mesure

```text
                                             ZUPONE
                                               │
          ┌────────────────────────────────────┼────────────────────────────────────┐
          │                                    │                                    │
       ZupEat                               ZupDrive                         autres services
          │                                    │
    ┌─────┴────────────────┐                   │
    │             │        │                   │
 Customer    Merchant    Delivery            Driver
    │     │     │          │
    └─────┴─────┴──────────┘
                 │
             ZupEat API
                  │
        ┌─────────┴─────────┐
        │                   │
    PostgreSQL            Redis
        │
     Prisma
```

ZupEat est la plateforme métier principale.

ZupOne représente le groupe / écosystème.

Les applications clientes et mobiles doivent rester clientes de l'API et ne doivent pas contourner les règles métier ou de sécurité du backend.
