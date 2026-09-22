# 📊 Analyse : Refonte d'Identité Unifiée - Intégration dans l'Architecture Existante

## 🎯 Objectif
Adapter la refonte d'identité unifiée (phases 1-3) au projet ZupOne existant (backend Express + Prisma).

---

## 📋 Architecture Actuelle

### Backend Structure
```
backend/
├── src/
│   ├── services/
│   │   ├── auth.service.ts (JWT avec orgId, storeIds, role)
│   │   ├── user.service.ts (createOrganization auto)
│   │   ├── customer.service.ts
│   │   ├── driver-approval.service.ts
│   │   └── ... (43 services au total)
│   ├── routes/
│   │   ├── auth.ts (signup, login)
│   │   ├── admin.ts (911 lignes)
│   │   ├── superowner.ts (2382 lignes)
│   │   ├── drivers.ts (765 lignes)
│   │   ├── client.ts (778 lignes)
│   │   └── ... (37 routeurs au total)
│   ├── middleware/
│   │   ├── auth.ts (authMiddleware, compteDuJeton)
│   │   └── throttle.ts
│   └── config/
│       └── env.ts (JWT_SECRET, etc.)
├── prisma/
│   ├── schema.prisma (Modèles complets)
│   └── migrations/ (Historique)
└── package.json (Express, Prisma, JWT, etc.)
```

### Modèles Prisma Existants
- ✅ **User** (id, email, passwordHash, isSystemAdmin, isSuperOwner, status, createdAt)
- ✅ **Organization** (id, name, slug, tier, plan, status, memberships[])
- ✅ **Membership** (userId, orgId, role, createdAt) — liaison User ↔ Org
- ✅ **Driver** (id, userId, status: PENDING|ACTIVE|REJECTED, createdAt)
- ✅ **Customer** (id, orderedAt, email, fullName, phone, address) **← SANS userId !**
- ✅ **Store** (id, organizationId, name, slug)
- ✅ **Order**, **Product**, **Delivery**, etc.

---

## 🔴 Points d'Incompatibilité (Refonte vs Actuel)

| Aspect | Refonte (Objectif) | Actuel | Impact |
|--------|-------------------|--------|--------|
| **JWT Payload** | `{ userId }` | `{ userId, orgId, storeIds, role }` | 🔴 Major |
| **Signup** | Crée User + Customer | Crée User + Organization | 🔴 Major |
| **Customer** | userId obligatoire (linked) | Pas de userId (guest) | 🟡 Moyen |
| **Role Source** | Vérifiée en base chaque requête | Encodée dans JWT | 🔴 Major |
| **Auto-Org** | Non | Oui (UserService.createOrganization) | 🟡 Moyen |
| **First User** | Super Owner (isSuperOwner=true) | Super Owner (isSuperOwner=true) | ✅ Aligné |

---

## ✅ Ce Qui Peut Rester (Pas à Changer)

1. **Modèles de base OK** :
   - User, Organization, Membership, Driver, Store
   - Pas besoin de migrer la schema Prisma complètement

2. **Services complexes OK** :
   - driver-approval, driver-payout, driver-rating
   - store, product, order services (métier)

3. **Routes métier OK** :
   - admin.ts, superowner.ts, client.ts (public)
   - drivers.ts (peut rester pour livreurs existants)

4. **Middleware OK** :
   - throttle, errorHandler, logger
   - auth.ts (authMiddleware peut adapter la signature)

---

## 🔧 Changements Requis pour la Refonte

### Phase 1 : Adapter Customer (Prisma)
**Fichier** : `backend/prisma/schema.prisma`

```prisma
model Customer {
  id       String  @id @default(cuid())
  userId   String  @unique  // ✅ NEW — Obligatoire
  user     User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Champs existants gardés
  orderedAt DateTime? @deprecated  // À revoir
  email     String?   @deprecated  // Utiliser user.email
  fullName  String?   @deprecated  // Utiliser user.name
  phone     String?   @deprecated  // Utiliser user.phone
  address   String?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([userId])
}

model User {
  // ... champs existants ...
  customer  Customer?  // ✅ NEW — Relation inverse
}
```

**Action** : 
- Migration Prisma : ajouter `userId` à Customer (nullable d'abord pour migrants)
- Déprécier les champs redondants (email, fullName, phone)

---

### Phase 2 : Simplifier JWT (auth.service.ts)

**Avant** :
```ts
interface JwtPayload {
  userId: string;
  orgId: string;
  storeIds: string[];
  role: "ADMIN" | "STORE_MANAGER" | "STORE_STAFF";
  iat?: number;
  exp?: number;
}
```

**Après** :
```ts
interface JwtPayload {
  userId: string;
  iat?: number;
  exp?: number;
}
```

**Actions** :
- Modifier `generateAccessToken(userId)` → retour un token `{ userId }`
- Garder `generateRefreshToken(userId)` inchangé
- Adapter tous les appels à `generateAccessToken` (routes auth, admin, etc.)

---

### Phase 3 : Routes d'Inscription Unifiées

#### Nouvelle Structure
```
Routes Auth (refactorisées) :
├── POST /auth/signup (simplifié)
│   ├── Crée User (pas d'Org auto)
│   ├── Crée Customer (activation auto)
│   └── Retour JWT simplifié { userId }
│
├── POST /auth/login (inchangé)
│   └── Retour JWT simplifié { userId }
│
├── POST /auth/merchant-register (NOUVEAU)
│   ├── Crée User + Organization + Membership
│   └── Retour JWT simplifié + org
│
├── POST /me/become-merchant (NOUVEAU, auth requise)
│   ├── User existe déjà → ajoute role commerçant
│   └── Crée Organization + Membership
│
├── POST /drivers/register (adapter existant)
│   ├── Crée User + Driver
│   └── Retour JWT simplifié
│
├── POST /me/become-driver (NOUVEAU, auth requise)
│   ├── User existe → ajoute role livreur
│   └── Crée Driver
│
└── GET /me/roles (NOUVEAU, auth requise)
    └── Retourne état de tous les rôles
```

---

## 📊 Matrice d'Impact des Routes Existantes

| Route | Changement | Raison | Risque |
|-------|-----------|--------|--------|
| POST /auth/signup | 🟡 Adapter | Plus d'auto-Org | Moyen |
| POST /auth/login | ✅ Minimal | JWT format change | Bas |
| POST /auth/refresh-token | ✅ Inchangé | Même logique | Bas |
| POST /admin/... | 🔴 Réécrire | Plus de role du JWT | Haut |
| POST /superowner/... | 🔴 Réécrire | Plus de orgId du JWT | Haut |
| POST /drivers/register | 🟡 Adapter | Pas d'auto-Org | Moyen |
| GET /drivers/:id/... | 🟡 Adapter | Vérif rôle en base | Moyen |
| GET /client/... | ✅ Minimal | Logique inchangée | Bas |

---

## 🎯 Ordre d'Intégration Recommandé

### Étape 1 : Prisma (Phase 1)
1. Créer migration : ajouter `Customer.userId` (nullable)
2. Ajouter `User.customer` relation inverse
3. Migration reset / apply

### Étape 2 : JWT Simplifié (Phase 2)
1. Modifier `JwtPayload` interface
2. Adapter `generateAccessToken(userId)`
3. **Adapter authMiddleware** : charger User en base (toujours frais)
4. Chercher & remplacer tous les usages de `req.user.orgId`, `req.user.role`

### Étape 3 : Routes Unifiées (Phase 3)
1. Simplifier `POST /auth/signup` (plus d'auto-Org)
2. Créer `POST /auth/merchant-register` (nouveau)
3. Créer `POST /me/become-merchant` (nouveau)
4. Adapter `POST /drivers/register`
5. Créer `POST /me/become-driver` (nouveau)
6. Créer `GET /me/roles` (nouveau)

### Étape 4 : Adapter Routes Existantes (Phase 2 Suite)
1. Routes /admin/* : lire orgId depuis params, vérifier en base
2. Routes /superowner/* : idem
3. Routes /drivers/* : vérifier rôle Driver en base

---

## ⚠️ Décisions à Trancher

1. **Migration Customer.userId** :
   - Nullable d'abord (migration progressive) ou obligatoire direct ?
   - Que faire des guests existants (Customer sans userId) ?

2. **Auto-Organization à signup** :
   - L'abandonner complètement ?
   - Ou offrir un second endpoint pour créer une org plus tard ?

3. **Backward Compatibility** :
   - Supporter les anciens tokens JWT (avec orgId) pendant transition ?
   - Ou migration hard-cut ?

4. **Routes admin/superowner** :
   - Toutes les réécrire en une seule refonte ?
   - Ou progressif (réécrire au fur et à mesure) ?

---

## 📈 Complexité Estimée

| Phase | Tâches | Durée | Risque |
|-------|--------|-------|--------|
| **Phase 1** (Prisma) | 1 migration | 1 jour | Bas |
| **Phase 2** (JWT) | Auth.service + middleware + grep/replace | 2-3 jours | Moyen |
| **Phase 3** (Routes) | 6 nouveaux/adaptés | 2-3 jours | Moyen |
| **Phase 4** (Admin/Superowner) | Réécriture routes | 3-4 jours | Haut |
| **Phase 5** (Tests) | Tous les flux | 2-3 jours | Moyen |

**Total estimé** : 2-3 semaines (si pas de freeze autre features)

---

## 🚀 Recommandations

1. **Commencer par Phase 1 (Prisma)** : migration simple, faible risque
2. **Phase 2 en parallèle** : JWT + middleware
3. **Phase 3** : routes unifiées (nouvelles, pas de breakage)
4. **Phase 4** : réécrire routes complexes (admin/superowner) avec tests
5. **Tests tout au long** : chaque phase a des tests manuels + auto

---

**Prêt pour démarrer ? Quelle phase commences-tu en priorité ?** 🎯
