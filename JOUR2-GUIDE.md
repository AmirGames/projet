# 📅 JOUR 2 - Auth API (Signup, Login, JWT)

**Objectif**: Créer les endpoints d'authentification (signup, login, refresh) côté API.

**Durée estimée**: 6-8 heures

---

## ✅ Checklist Jour 2

- [ ] Endpoint POST /auth/signup
- [ ] Endpoint POST /auth/login
- [ ] Endpoint POST /auth/refresh
- [ ] Prisma migrations OK
- [ ] Error handling complet
- [ ] API testée avec curl/Postman

---

## 🎯 Tâches par ordre

### Tâche 1: Migrations Prisma (30 min)

```bash
cd backend

# Générer le Prisma client
npx prisma generate

# Créer la migration initiale
npx prisma migrate dev --name initial

# Réponses attendues dans le terminal:
# ✓ Generated Prisma Client to ./node_modules/@prisma/client
# ✓ Your database is now in sync with your schema
```

**Fichiers modifiés:**
- Aucun (juste valider que la migration passe)

---

### Tâche 2: Types TypeScript (15 min)

Créer le fichier `src/types/index.ts` pour centraliser les types:

**Fichier**: `backend/src/types/index.ts`

```typescript
export enum UserRole {
  ADMIN = "ADMIN",
  STORE_MANAGER = "STORE_MANAGER",
  STORE_STAFF = "STORE_STAFF",
}

export interface SignupInput {
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export interface RefreshTokenInput {
  refreshToken: string;
}
```

---

### Tâche 3: Validation Schemas Zod (20 min)

Créer le fichier `src/utils/validation.ts`:

**Fichier**: `backend/src/utils/validation.ts`

```typescript
import { z } from "zod";

export const signupSchema = z
  .object({
    email: z.string().email("Email invalide"),
    name: z.string().min(2, "Nom minimum 2 caractères"),
    password: z.string().min(8, "Mot de passe minimum 8 caractères"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token requis"),
});
```

---

### Tâche 4: Auth Routes (2 heures)

Créer le fichier `src/routes/auth.ts`:

**Fichier**: `backend/src/routes/auth.ts`

```typescript
import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthService } from "../services/auth.service.js";
import { signupSchema, loginSchema, refreshTokenSchema } from "../utils/validation.js";
import { ApiError } from "../middleware/errorHandler.js";
import { logger } from "../config/logger.js";

const prisma = new PrismaClient();
const router = Router();

// =====================================================
// POST /auth/signup
// =====================================================
router.post("/signup", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = signupSchema.parse(req.body);

    // Vérifier si l'email existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ApiError(400, "Email déjà utilisé", "EMAIL_EXISTS");
    }

    // Hasher le mot de passe
    const passwordHash = await AuthService.hashPassword(body.password);

    // Générer token de vérification email
    const { token: emailToken, expiresAt: emailTokenExpiresAt } =
      AuthService.generateVerificationToken(body.email);

    // Créer l'utilisateur
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash,
        emailToken,
        emailTokenExpiresAt,
      },
    });

    logger.info("User created", { userId: user.id, email: user.email });

    // TODO: Envoyer email de vérification (Week 2)

    // Générer tokens temporaires (valides jusqu'à vérification)
    const accessToken = AuthService.generateAccessToken({
      userId: user.id,
      orgId: "", // À créer lors de la création org
      storeIds: [],
      role: "STORE_STAFF", // Default role
    });

    const refreshToken = AuthService.generateRefreshToken(user.id);

    res.status(201).json({
      message: "Compte créé avec succès. Vérifiez votre email.",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// POST /auth/login
// =====================================================
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);

    // Trouver l'utilisateur
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });

    if (!user) {
      throw new ApiError(401, "Email ou mot de passe incorrect", "INVALID_CREDENTIALS");
    }

    // Vérifier le mot de passe
    const passwordValid = await AuthService.comparePassword(
      body.password,
      user.passwordHash
    );

    if (!passwordValid) {
      throw new ApiError(401, "Email ou mot de passe incorrect", "INVALID_CREDENTIALS");
    }

    // Vérifier que l'email est validé (TODO: relâcher après MVP)
    // if (!user.emailVerified) {
    //   throw new ApiError(403, "Email non vérifié", "EMAIL_NOT_VERIFIED");
    // }

    logger.info("User logged in", { userId: user.id, email: user.email });

    // Récupérer les memberships (org, stores, role)
    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: { org: true },
    });

    // Créer les tokens
    // Pour MVP: on prend le premier membership (single org par user)
    const membership = memberships[0];

    const accessToken = AuthService.generateAccessToken({
      userId: user.id,
      orgId: membership?.orgId || "",
      storeIds: membership?.storeIds || [],
      role: membership?.role as any || "STORE_STAFF",
    });

    const refreshToken = AuthService.generateRefreshToken(user.id);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// POST /auth/refresh
// =====================================================
router.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = refreshTokenSchema.parse(req.body);

    // Vérifier le refresh token
    const decoded = AuthService.verifyRefreshToken(body.refreshToken);

    // Récupérer l'utilisateur
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      throw new ApiError(401, "Utilisateur introuvable", "USER_NOT_FOUND");
    }

    // Récupérer le membership
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
    });

    // Générer nouveau access token
    const accessToken = AuthService.generateAccessToken({
      userId: user.id,
      orgId: membership?.orgId || "",
      storeIds: membership?.storeIds || [],
      role: membership?.role as any || "STORE_STAFF",
    });

    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// POST /auth/verify-email (Jour 3)
// =====================================================
// À implémenter après SendGrid

export default router;
```

---

### Tâche 5: Ajouter les routes au app.ts (10 min)

**Modifier**: `backend/src/app.ts`

```typescript
// Ajouter ces imports au top:
import authRouter from "./routes/auth.js";

// Ajouter cette ligne avant setupErrorHandling():
app.use("/api/auth", authRouter);
```

---

### Tâche 6: Tester l'API (30 min)

Avec curl (terminal) ou Postman:

**Test 1: Signup**
```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "John Doe",
    "password": "SecurePassword123",
    "confirmPassword": "SecurePassword123"
  }'

# Réponse attendue:
{
  "message": "Compte créé avec succès. Vérifiez votre email.",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "...",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

**Test 2: Login**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123"
  }'

# Même réponse que signup
```

**Test 3: Refresh Token**
```bash
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }'

# Réponse:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Test 4: Error - Invalid email**
```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "invalid-email",
    "name": "John Doe",
    "password": "SecurePassword123",
    "confirmPassword": "SecurePassword123"
  }'

# Erreur attendue (400):
{
  "error": "Validation error",
  "details": { ... }
}
```

---

## 🚀 Validation Jour 2

À la fin du jour, vous devez avoir:

- [x] 3 endpoints fonctionnels: signup, login, refresh
- [x] Validation des inputs (Zod)
- [x] Gestion des erreurs
- [x] Tokens JWT générés
- [x] Mots de passe hashés (bcrypt)
- [x] Logs d'audit (logger)
- [x] Tests curl/Postman OK

**Logs attendus au startup:**
```
[2024-01-10 14:32:10] DEBUG ✅ Environment loaded: development
[2024-01-10 14:32:10] INFO ✓ Generated Prisma Client
[2024-01-10 14:32:10] INFO ✓ Your database is now in sync
[2024-01-10 14:32:15] INFO Testing database connection...
[2024-01-10 14:32:15] INFO ✅ Database connected
[2024-01-10 14:32:15] INFO 🚀 Server running on http://localhost:3001
```

---

## 📝 Notes Jour 2

- **Pas de frontend pour le moment** (juste API)
- **Pas d'email real** pour MVP (SendGrid = Jour 3)
- **Pas de tests automatisés** (focus features)
- **Une seule org par user** pour MVP (simplification)

---

## 🔗 Prochaines étapes (Jour 3)

- [ ] Email verification (SendGrid)
- [ ] Organization creation API
- [ ] Auth middleware (protéger les routes)
- [ ] User invitations

---

**Status**: READY TO START 🚀
