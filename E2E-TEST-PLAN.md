# Plan de tests E2E — identité unifiée, rôles et validations

**Mis à jour** : 4 octobre 2026 (scénarios historiques du 27 septembre ; première version : 22 septembre)
**Environnement du plan** : local ou environnement de test isolé

Le site est désormais déployé sur un VPS. Ce plan décrit des scénarios à
exécuter, pas un compte rendu attestant leur réussite. L'état courant et les
validations connues figurent dans [docs/etat-projet.md](docs/etat-projet.md).
Les étapes de préparation et les suites générales peuvent vider la base :
les réserver à une base dédiée, jamais à la base du VPS en exploitation.

Ce plan se déroule **à la main**, dans un navigateur et avec `curl`. Il couvre le
parcours d'un compte ZupOne : inscription, choix des espaces, passage
commerçant et livreur, validation par la plateforme, droits de l'équipe et
suppression de compte.

Il ne remplace pas les vérifications automatiques — des scripts qui relisent la
base après chaque action (voir `README.md`, « Vérifications ») — : il sert à
voir l'enchaînement comme un utilisateur le voit.

> **Toutes les routes de l'API sont sous `/api`** : `POST /api/auth/signup`,
> `GET /api/auth/me/roles`… Les exemples ci-dessous visent
> `http://localhost:3001/api`.

---

## Préparation

### 1. Les services

```bash
# À la racine du projet
docker-compose up -d
docker-compose ps
```

Services attendus :
- PostgreSQL (localhost:5432, base `saas_dev`, utilisateur `postgres` / `postgres`)
- Redis (localhost:6379) — facultatif en local
- Mailpit (http://localhost:8025) — les courriels de confirmation

Sans Docker, une base PostgreSQL locale suffit (`createdb zupone_dev`, voir le
README).

### 2. L'API

```bash
cd backend
npm install
cp .env.example .env
# Dans .env :
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas_dev?schema=public
#   JWT_SECRET=… (32 caractères au moins)
#   JWT_REFRESH_SECRET=…
#   ENABLE_STRIPE=false        (sinon une commande hors espèces attend son paiement)
npm run dev                  # applique les migrations, régénère Prisma, écoute sur :3001
```

### 3. Le site

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev                  # http://localhost:3000
```

### 4. Une base vide

Aucune inscription ne donne les droits de la plateforme : le superowner se
crée en ligne de commande (`npm run create-superowner`, test 1.2). Le plan
suppose une base vide au départ :

```bash
cd backend
node scripts/verification/reinitialiser.mjs   # garde-fou : le nom de la base doit contenir « test »
```

Sur `saas_dev`, recréez plutôt la base (`dropdb saas_dev && createdb saas_dev`)
puis `npm run dev`.

---

## Phase 1 — Inscription

### Test 1.1 : le premier compte inscrit reste un compte ordinaire

```
Étapes :
1. Ouvrir http://localhost:3000/signup
2. Remplir : e-mail test-user-001@example.com, nom « Test User 001 »,
   mot de passe TestPassword123!, cocher l'acceptation des conditions
3. Valider

Attendu :
✅ Redirection vers /auth/role-selection
✅ L'espace client est actif ; « Devenir commerçant » et « Devenir livreur » proposés

En base :
✅ User : isSuperOwner = false, isSystemAdmin = false (base vide ou non)
✅ Customer créé et relié (userId)
✅ AcceptationConditions : une ligne avec les versions de cgu, cgv, confidentialite
✅ Un courriel de confirmation dans Mailpit (si ENABLE_EMAIL_VERIFICATION n'est pas « false »)
```

### Test 1.2 : le superowner se crée en ligne de commande

```bash
cd backend
SUPEROWNER_EMAIL=test-user-001@example.com SUPEROWNER_PASSWORD='TestPassword123!' npm run create-superowner
SUPEROWNER_EMAIL=autre@example.com SUPEROWNER_PASSWORD='TestPassword123!' npm run create-superowner
```

```
Attendu :
✅ 1re commande : « Compte existant promu superowner : test-user-001@example.com »
   (mot de passe inchangé)
✅ 2e commande : « Un superowner existe déjà (test-user-001@example.com) : rien n'a changé. »
✅ En base : un seul User avec isSuperOwner = true ; autre@example.com n'existe pas
✅ UPDATE "User" SET "isSuperOwner" = true sur un autre compte est refusé
   (index unique User_un_seul_superowner)

Puis :
1. Se déconnecter
2. S'inscrire avec test-user-002@example.com

Attendu :
✅ User.isSuperOwner = false, User.isSystemAdmin = false
✅ Aucun accès à /superowner (voir phase 7)
```

### Test 1.3 : les conditions sont exigées

```bash
curl -s -X POST http://localhost:3001/api/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"sans-conditions@example.com","password":"TestPassword123!","name":"Test User"}'
```

```
Attendu :
✅ 400, « conditionsAcceptees : Vous devez accepter les conditions pour continuer »
✅ Aucun compte créé
```

Les messages de validation sont en français et nomment le champ (« Nom :
Minimum 2 caractères »).

### Test 1.3 bis : un mot de passe solide est exigé

```
Étapes :
1. Sur /signup, taper « motdepasse1 » dans le mot de passe
2. Observer la liste sous le champ, puis valider
3. Remplacer par « Motdepasse1 » et valider

Attendu :
✅ Les critères se cochent pendant la saisie ; « Au moins une lettre majuscule » reste à cocher
✅ Refus avant envoi : « Le mot de passe doit contenir 8 caractères minimum,
   dont un chiffre, une minuscule et une majuscule. »
✅ Côté API, même refus en 400 (« Mot de passe : au moins une lettre majuscule »),
   aucun compte créé
✅ « Motdepasse1 » est accepté : les caractères spéciaux ne sont pas exigés
✅ Même règle sur /driver/signup, /merchant/register, /reinitialiser et dans les
   applications client et livreur
✅ Application client : la création de compte exige de cocher l'acceptation des
   CGU, des CGV et de la politique de confidentialité (liens vers le site) ;
   le compte créé a son acceptation en base (AcceptationConditions)
✅ Un compte créé avant la règle avec un mot de passe plus faible se connecte toujours
```

### Test 1.4 : une adresse déjà prise est refusée

```
Étapes :
1. S'inscrire à nouveau avec test-user-001@example.com

Attendu :
✅ 409, « Cet email est déjà utilisé », code EMAIL_EXISTS, affiché sur le formulaire
✅ Aucun second compte ; le mot de passe du compte existant ne change pas
```

(Jusqu'au 27 septembre, ce cas répondait 500 : la contrainte d'unicité de la
base remontait telle quelle. Deux inscriptions simultanées qui passeraient
toutes deux la vérification reçoivent désormais un 409 `ALREADY_EXISTS`.)

### Test 1.4 bis : s'inscrire après avoir commandé sans compte

```
Étapes :
1. Sans être connecté, passer une commande avec l'adresse test-invite@example.com
2. S'inscrire ensuite avec cette même adresse

Attendu :
✅ 201, compte créé
✅ La fiche client née de la commande est reprise et rattachée au compte :
   une seule fiche à cette adresse, et la commande apparaît dans l'historique
```

(Jusqu'au 27 septembre, l'inscription recréait la fiche client, butait sur son
adresse unique et répondait 409 « Cette valeur est déjà utilisée » — en laissant
derrière elle un compte créé. Vérifié par `verif-inscription-doublon`.)

### Test 1.4 ter : une adresse ne dépend pas de sa casse

```
Étapes :
1. S'inscrire avec " Test-Casse@Example.COM " (majuscules, espaces autour)
2. Se déconnecter, puis s'inscrire à nouveau avec test-casse@example.com
3. Se connecter avec TEST-CASSE@EXAMPLE.COM

Attendu :
✅ 1 : compte créé, adresse enregistrée « test-casse@example.com »
✅ 2 : 409, « Cet email est déjà utilisé » ; toujours un seul compte
✅ 3 : connexion acceptée
```

(Jusqu'au 27 septembre, les deux inscriptions ouvraient deux comptes, et la
connexion exigeait la casse exacte de l'inscription. La migration 0014 convertit
les adresses existantes, sauf les doublons à la casse près, laissés tels quels.)

### Test 1.5 : trop d'inscriptions depuis une même adresse IP

En production seulement (`NODE_ENV=production`) : dix inscriptions par heure et
par IP, tous formulaires confondus (client, commerçant, livreur) ; la onzième
reçoit un 429.

---

## Phase 2 — Le jeton

### Test 2.1 : le jeton ne porte que l'identifiant

```
Étapes :
1. Se connecter avec test-user-001@example.com
2. DevTools → Réseau : réponse de POST /api/auth/login (ou /api/auth/refresh),
   copier `accessToken` — il n'est plus dans le Local Storage : le jeton
   d'accès ne vit qu'en mémoire, le renouvellement dans le cookie httpOnly
   `zup_refresh`
3. Le décoder (https://jwt.io ou `node -e`)

Attendu :
✅ { "userId": "…", "iat": …, "exp": … }
❌ Ni orgId, ni rôle, ni storeIds : tout se relit en base à chaque requête
```

Durées imposées : 15 minutes pour le jeton d'accès (`JWT_EXPIRES_IN`,
`backend/src/config/env.ts`), 7 jours pour le jeton de renouvellement
(`JWT_REFRESH_EXPIRES_IN`). Les anciens jetons ayant une durée supérieure
sont refusés ; une nouvelle connexion est nécessaire après le déploiement. Le site renouvelle
le jeton d'accès en silence avant son échéance.

### Test 2.2 : session expirée ou révoquée

```
Étapes :
1. DevTools → Application → Cookies : remplacer la valeur de `zup_refresh`
   par une valeur invalide (c'est là que vit la session ; un jeton posé dans
   le Local Storage n'est plus lu)
2. Recharger une page d'un espace

Attendu :
✅ Le renouvellement de la session est refusé (401)
✅ Le site renvoie vers la connexion de l'espace, sans boucle
✅ La page de connexion dit « Votre session n'est plus valable » ; le message
   disparaît au rechargement suivant

Automatisé : `frontend/scripts/verif-session-perimee.mjs`.
```

### Test 2.3 : trop d'essais de connexion

Dix essais par quart d'heure, comptés par IP et par compte : le onzième reçoit un
429 **même avec le bon mot de passe**. Un autre compte, depuis la même IP,
n'est pas gêné.

---

## Phase 3 — `GET /api/auth/me/roles`

### Test 3.1 : les espaces après l'inscription

```
Étapes :
1. Connecté, ouvrir l'onglet réseau sur /auth/role-selection
2. Lire la réponse de GET /api/auth/me/roles

Attendu :
✅ 200
✅ user : id, email, isSuperOwner, isSystemAdmin, platformRole,
   platformRoleLabel, accesEquipe (un rôle par plateforme pour un membre de l'équipe)
✅ roles.customer  = { active: true,  customerId: "…" }
✅ roles.driver    = { active: false, driverId: null, status: null }
✅ roles.merchant  = { active: false, organizations: [] }
```

### Test 3.2 : authentification exigée

```bash
curl -s http://localhost:3001/api/auth/me/roles -H "Authorization: Bearer invalide"
```

```
Attendu :
✅ 401, { "error": "Invalid token", "code": "INVALID_TOKEN" }
```

### Test 3.3 : le sélecteur d'espaces

```
Étapes :
1. Avec un compte qui a plusieurs espaces, cliquer sur le logo en haut à gauche

Attendu :
✅ Le menu liste les autres espaces du compte (client, commerçant, livreur, plateforme)
✅ Un membre de l'équipe voit l'espace plateforme sous le nom de son groupe
   (Support, Administrateur…), pas « Super Owner »
✅ Un compte qui n'a que l'espace client est envoyé directement sur /client/orders
```

---

## Phase 4 — Devenir commerçant

### Test 4.1 : activer l'espace commerçant

```
Étapes :
1. Sur /auth/role-selection (test-user-002), cliquer « Devenir commerçant »
2. Remplir :
   - Nom de l'entreprise : My Test Restaurant
   - Nom de la boutique : Main Location (l'adresse web se déduit du nom)
   - Genre : restaurant (et type de cuisine)
   - Téléphone : +32 470 12 34 56
   - Adresse : choisir une suggestion (Namur, 5000)
   - Description : Un restaurant de test
3. Créer

Attendu :
✅ 201, « Rôle de commerçant activé avec succès »
✅ L'espace commerçant apparaît dans /auth/me/roles

En base :
✅ Organization : slug = celui de la boutique, tier FREE, approvedAt VIDE
   (le commerce attend la validation de la plateforme)
✅ Store créé avec ses coordonnées quand la suggestion en donne
✅ Membership : rôle ADMIN, storeIds contient la boutique
```

### Test 4.2 : adresse web déjà prise

```
Étapes :
1. Avec un autre compte, créer un commerce avec la même adresse web

Attendu :
✅ 400, « Cette URL est déjà utilisée », code SLUG_EXISTS
```

### Test 4.3 : plusieurs commerces pour un même compte

```
Attendu :
✅ Un second commerce se crée ; roles.merchant.organizations en compte deux
✅ Le sélecteur de boutique de l'espace commerçant passe de l'un à l'autre
✅ Le nombre de boutiques reste borné par la formule souscrite
```

### Test 4.4 : un commerce non validé ne vend pas

```
Étapes :
1. Dans l'espace commerçant, préparer la boutique (catalogue, horaires)
2. Tenter de l'ouvrir
3. Chercher la boutique depuis l'espace client

Attendu :
✅ Bandeau « en attente de validation » ; l'ouverture est refusée
✅ La boutique n'apparaît pas aux clients ; une commande est refusée par le serveur
```

### Test 4.5 : la plateforme valide le commerce

```
Étapes :
1. Le commerçant dépose ses pièces dans /merchant/profil :
   immatriculation (Kbis / BCE), identité du propriétaire, RIB
2. En superowner : /superowner/organizations, filtre « À valider »
3. Examiner chaque pièce (aperçu image ou PDF), puis « Valider le commerce »

Attendu :
✅ La plateforme est notifiée à chaque pièce déposée
✅ La validation est refusée tant qu'une pièce exigée n'est pas validée
✅ Une fois validé : Organization.approvedAt renseigné, la boutique peut ouvrir
```

### Test 4.6 : cloisonnement entre commerçants

```
Attendu :
✅ Un commerçant ne voit ni ne modifie la boutique d'un autre, même en
   passant l'identifiant de celle-ci dans l'URL ou le corps de la requête (403)
```

---

## Phase 5 — Devenir livreur

### Test 5.1 : candidature

```
Étapes :
1. Sur /auth/role-selection, cliquer « Devenir livreur »
2. Remplir : téléphone +32 470 12 34 56, véhicule Scooter / Moto, plaque 1-ABC-123
3. Valider

Attendu :
✅ 201, « Candidature de livreur soumise avec succès » ; la réponse porte de nouveaux jetons
✅ roles.driver = { active: true, status: "PENDING", driverId: "…" }

En base :
✅ Driver : userId relié, status PENDING, nom et e-mail repris du compte,
   vehicleType (car, scooter ou bike), vehiclePlate
```

L'inscription se fait aussi depuis `/driver/signup` et depuis l'application
livreur (écran « Devenir livreur »).

### Test 5.2 : pas deux candidatures

```
Attendu :
✅ 400, « Vous avez déjà un profil livreur », code DRIVER_EXISTS
```

### Test 5.3 : dossier et validation

```
Étapes (livreur) :
1. Dans /driver/profile, déposer les pièces exigées pour un scooter :
   pièce d'identité, permis, assurance, carte grise, sac isotherme
   (photo du sac ou facture) — en image ou en PDF
2. Tenter de se mettre en ligne

Étapes (superowner) :
3. /superowner/drivers : ouvrir le dossier, valider les pièces une à une
   (une date d'expiration mal saisie se corrige avec « Modifier »)
4. Cliquer « Valider le livreur »

Attendu :
✅ Tant que le dossier n'est pas validé : pas de mise en ligne, aucune course proposée
✅ Sans le sac isotherme : 400 « Dossier incomplet : Sac isotherme (photo du sac
   ou facture) reste à valider. », code INCOMPLETE_FILE
✅ À vélo, seules l'identité et le sac isotherme sont exigées
✅ Après validation : Driver.status = ACTIVE, le livreur peut se mettre en ligne
✅ Un refus de pièce exige un motif, que le livreur lit
```

---

## Phase 6 — Parcours complet

### Test 6.1 : un compte, trois espaces

```
Étapes :
1. S'inscrire avec complete-user@example.com
2. Devenir commerçant (« Complete Restaurant »)
3. Devenir livreur
4. Lire GET /api/auth/me/roles

Attendu après chaque étape :
1️⃣ client seul
2️⃣ client + commerçant (1 organisation, en attente de validation)
3️⃣ client + commerçant + livreur (PENDING)
4️⃣ customer.active, merchant.organizations[1], driver.status = "PENDING"
```

---

## Phase 7 — Droits et équipe de la plateforme

### Test 7.1 : pas d'accès à l'organisation d'un autre

```
Étapes :
1. Compte A (commerce X), compte B (autre compte)
2. Avec le jeton de B : GET /api/stores?orgId=<X>, ou une modification d'une boutique de X

Attendu :
✅ Refus (403) : rien de X n'est lu ni modifié
```

### Test 7.2 : l'administration est réservée à l'équipe

```bash
curl -s http://localhost:3001/api/superowner/dashboard -H "Authorization: Bearer <jeton de test-user-002>"
```

```
Attendu :
✅ 403, « Accès refusé - votre rôle n'ouvre pas cette section », code FORBIDDEN
```

### Test 7.3 : un membre de l'équipe ne voit que ses sections

```
Étapes (superowner) :
1. /superowner/user-management : nommer test-user-002 « Support » sur ZupEat
   (la personne doit déjà avoir un compte)
2. /superowner/roles : vérifier ce que coche le rôle Support

Étapes (test-user-002) :
3. Se reconnecter, ouvrir /superowner

Attendu :
✅ Le menu ne montre que les sections ouvertes au rôle
✅ Une section en lecture seule : GET passe, toute modification répond 403
   « Accès refusé - votre rôle ne permet pas de modifier cette section »
✅ Les chiffres financiers (revenu, MRR…) n'apparaissent pas sans « Facturation »
✅ Le Support peut suspendre un commerce, pas le fermer (droit à part)
✅ La gestion de l'équipe et des rôles reste au superowner seul
```

### Test 7.4 : rôles personnalisés et par plateforme

```
Étapes (superowner) :
1. /superowner/roles : créer un rôle « Facturation », cocher ses sections
2. L'attribuer à un membre
3. Tenter de supprimer le rôle, puis retirer le membre et le supprimer
4. Donner à un même membre un rôle différent sur ZupDrive

Attendu :
✅ Le rôle apparaît dans la liste et s'attribue
✅ Suppression refusée tant qu'un membre le porte ; les trois rôles de base
   (SuperAdmin, Administrateur, Support) ne se suppriment pas
✅ AccesEquipe : une ligne par membre et par plateforme (EAT, DRIVE)
```

### Test 7.5 : le jeton ne donne aucun droit

```
Étapes :
1. Modifier le jeton de A pour y ajouter un orgId ou un rôle
2. Appeler l'API avec ce jeton

Attendu :
✅ 401 : la signature ne correspond plus
✅ Même bien signé, un champ ajouté serait ignoré : les droits se relisent en base
```

---

## Phase 8 — Suppression de compte

### Test 8.1 : compte livreur

```
Étapes :
1. /suppression-compte (ou Paramètres › Vos données dans l'application livreur)
2. Lire l'aperçu, confirmer

Attendu :
✅ Refusée pendant une course
✅ Refusée en 409 IBAN_REQUIRED s'il reste un montant dû sans IBAN valide,
   avec le montant et le lundi du versement
✅ Acceptée : Driver.status = INACTIVE, hors ligne, suppressionDemandeeLe renseigné,
   demande transmise au support
✅ Le compte client ZupEat reste actif (connexion possible, espace client ouvert)
```

### Test 8.2 : compte client ZupEat

```
Étapes :
1. Dans l'application client : Paramètres › Vos données › Supprimer mon compte ZupEat
   (ou POST /api/client/me/suppression ; GET pour l'aperçu)

Attendu :
✅ Refusée pendant une commande en cours
✅ Profil, adresses, favoris, paniers et notifications ZupEat effacés ;
   commandes passées gardées, détachées
✅ Seul client : la connexion ZupOne disparaît et les sessions tombent
✅ Aussi livreur ou commerçant : la connexion reste, et le message le dit
```

---

## Tests automatiques

### Les vérifications (la référence)

```bash
cd backend
createdb zupone_test
DATABASE_URL="postgresql://.../zupone_test" npx prisma migrate deploy
DATABASE_URL="postgresql://.../zupone_test" PORT=3099 npm run dev          # un terminal
DATABASE_URL="postgresql://.../zupone_test" VERIF_API_URL=http://localhost:3099 npm run verif
```

Les suites qui couvrent ce plan : `verif-inscription-boutique`,
`verif-cloisonnement`, `verif-validation-commerce`,
`verif-livreurs-validation`, `verif-limites-connexion`,
`verif-suppression-livreur`, `verif-suppression-client`. Les réglages
nécessaires à la suite complète sont dans
`backend/scripts/verification/LISEZ-MOI.md`.

### Jest

```bash
cd backend
npm test -- src/routes/__tests__/refonte-e2e.test.ts
```

`refonte-e2e.test.ts` et `auth.integration.test.ts` datent de la refonte
d'identité ; ils ne couvrent ni la validation des commerces, ni les rôles de
l'équipe, ni les suppressions de compte.

---

## Problèmes courants

### « Database connection failed »
```
1. docker-compose ps : PostgreSQL doit être « healthy »
2. DATABASE_URL dans backend/.env
3. psql -U postgres -h localhost -d saas_dev
4. npm run dev applique lui-même les migrations en attente
```

### « Unknown argument … » au démarrage ou sur une route
```
Le client Prisma est en retard sur le schéma : relancer npm run dev
(predev = prisma migrate deploy && prisma generate).
```

### « Token invalid » après connexion
```
1. JWT_SECRET et JWT_REFRESH_SECRET dans .env (changés = jetons existants invalides)
2. En-tête « Authorization: Bearer <jeton> »
3. Le jeton n'a pas expiré
```

### « Organisation non identifiée » (MISSING_ORG)
```
La route commerçant n'a trouvé ni orgId ni storeId dans le corps, la requête
ou l'URL. Vérifier la boutique choisie dans le sélecteur de l'espace commerçant.
```

### Le commerce n'ouvre pas
```
Organization.approvedAt est vide : la plateforme ne l'a pas encore validé (test 4.5).
```

### Pas de courriel de confirmation
```
1. ENABLE_EMAIL_VERIFICATION n'est pas « false »
2. Mailpit tourne (http://localhost:8025) et SMTP_HOST / SMTP_PORT pointent dessus
```

---

## Récapitulatif à cocher

**Inscription et connexion**
- [ ] Aucune inscription n'est superowner, même la première
- [ ] Superowner créé par `npm run create-superowner`, rejouable sans effet
- [ ] Customer créé à l'inscription
- [ ] Conditions exigées et acceptation enregistrée
- [ ] Mot de passe : 8 caractères, chiffre, minuscule, majuscule (site et applis)
- [ ] Adresse déjà prise refusée en 409
- [ ] Inscription après une commande sans compte : fiche client reprise
- [ ] Adresse en minuscules : une seule inscription, connexion quelle que soit la casse
- [ ] Jeton : userId seul
- [ ] Limites de connexion et d'inscription

**Espaces**
- [ ] /auth/role-selection montre les trois espaces
- [ ] Sélecteur d'espaces par le logo
- [ ] Compte client seul redirigé vers /client/orders

**Commerçant**
- [ ] Organisation, boutique et appartenance créées
- [ ] Adresse web unique
- [ ] Plusieurs commerces par compte
- [ ] Commerce bloqué jusqu'à validation, puis validé

**Livreur**
- [ ] Candidature PENDING, pas de doublon
- [ ] Pièces exigées selon le véhicule, sac isotherme pour tous
- [ ] Validation refusée sur dossier incomplet, acceptée ensuite

**Droits**
- [ ] Organisation d'autrui inaccessible
- [ ] Administration réservée à l'équipe
- [ ] Sections et lecture / modification selon le rôle
- [ ] Rôles personnalisés et par plateforme
- [ ] Jeton modifié sans effet

**Suppression**
- [ ] Compte livreur : garde-fous, dernier versement, compte client intact
- [ ] Compte client ZupEat : données effacées, commandes gardées

---

## Modèle de compte rendu

```
PLAN E2E — COMPTE RENDU
Date : [DATE]
Testeur : [NOM]
Environnement : local

PHASE 1 — INSCRIPTION
  1.1 Premier inscrit ordinaire ........ [OK / ÉCHEC]
  1.2 Superowner en ligne de commande .. [OK / ÉCHEC]
  1.3 Conditions exigées ............... [OK / ÉCHEC]
  1.3 bis Mot de passe solide .......... [OK / ÉCHEC]
  1.4 Adresse déjà prise ............... [OK / ÉCHEC]
  1.5 Limite d'inscriptions ............ [OK / ÉCHEC / NON JOUÉ]

PHASE 2 — JETON
  2.1 userId seul ...................... [OK / ÉCHEC]
  2.2 Session expirée .................. [OK / ÉCHEC]
  2.3 Limite de connexion .............. [OK / ÉCHEC]

PHASE 3 — /api/auth/me/roles
  3.1 Espaces après inscription ........ [OK / ÉCHEC]
  3.2 Authentification exigée .......... [OK / ÉCHEC]
  3.3 Sélecteur d'espaces .............. [OK / ÉCHEC]

PHASE 4 — COMMERÇANT
  4.1 Activation ....................... [OK / ÉCHEC]
  4.2 Adresse web prise ................ [OK / ÉCHEC]
  4.3 Plusieurs commerces .............. [OK / ÉCHEC]
  4.4 Bloqué avant validation .......... [OK / ÉCHEC]
  4.5 Validation ....................... [OK / ÉCHEC]
  4.6 Cloisonnement .................... [OK / ÉCHEC]

PHASE 5 — LIVREUR
  5.1 Candidature ...................... [OK / ÉCHEC]
  5.2 Pas de doublon ................... [OK / ÉCHEC]
  5.3 Dossier et validation ............ [OK / ÉCHEC]

PHASE 6 — PARCOURS COMPLET
  6.1 Un compte, trois espaces ......... [OK / ÉCHEC]

PHASE 7 — DROITS
  7.1 Organisation d'autrui ............ [OK / ÉCHEC]
  7.2 Administration réservée .......... [OK / ÉCHEC]
  7.3 Sections du rôle ................. [OK / ÉCHEC]
  7.4 Rôles personnalisés .............. [OK / ÉCHEC]
  7.5 Jeton modifié .................... [OK / ÉCHEC]

PHASE 8 — SUPPRESSION
  8.1 Compte livreur ................... [OK / ÉCHEC]
  8.2 Compte client ZupEat ............. [OK / ÉCHEC]

BILAN : __ / 29 réussis — anomalies : …
```
