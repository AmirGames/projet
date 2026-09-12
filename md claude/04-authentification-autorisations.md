# AUTHENTIFICATION & AUTORISATIONS - JWT + RBAC

---

## 1. FLOW D'AUTHENTIFICATION

### 1.1 Registration

```
Client
  │
  ├─→ POST /graphql/auth/signup
  │    {
  │      email: "admin@pizzeria.be",
  │      password: "SecurePassword123",
  │      firstName: "Jean",
  │      lastName: "Dupont"
  │    }
  │
  └─→ Backend
      │
      ├─ Valider email (format, not existing)
      ├─ Valider password (strength)
      ├─ Hash password avec bcrypt
      ├─ Créer User
      ├─ Créer Organization (si c'est la première)
      ├─ Créer Membership (OWNER)
      ├─ Envoyer verification email (SendGrid)
      │
      └─ Response:
         {
           success: true,
           message: "Verification email sent",
           userId: "user_123"
         }

Client reçoit email → Clique lien
  │
  └─→ GET /api/auth/verify-email?token=xxx
      │
      └─→ Backend
          │
          ├─ Vérifier token
          ├─ Marquer User.emailVerified = now()
          │
          └─ Redirect login page
```

### 1.2 Login

```
Client
  │
  ├─→ POST /graphql/auth/login
  │    {
  │      email: "admin@pizzeria.be",
  │      password: "SecurePassword123"
  │    }
  │
  └─→ Backend
      │
      ├─ Chercher User par email
      ├─ Vérifier emailVerified
      ├─ Comparer password (bcrypt)
      │
      ├─ Si OK → Chercher Memberships (User → Organizations)
      │
      ├─ Créer JWT payload:
      │  {
      │    sub: "user_123",
      │    email: "admin@pizzeria.be",
      │    firstName: "Jean",
      │    lastName: "Dupont",
      │    organizations: [
      │      {
      │        id: "org_123",
      │        slug: "pizzeria-xy",
      │        role: "OWNER",
      │        stores: [
      │          "store_namur_123",
      │          "store_charleroi_456"
      │        ]
      │      },
      │      {
      │        id: "org_456",
      │        slug: "nightshop-xy",
      │        role: "MANAGER",
      │        stores: [
      │          "store_bruxelles_789"
      │        ]
      │      }
      │    ],
      │    iat: 1704067200,
      │    exp: 1704153600
      │  }
      │
      ├─ Sign JWT avec SECRET
      ├─ Refresh token (httpOnly cookie, 7 days)
      ├─ Update User.lastLoginAt
      │
      └─ Response:
         {
           accessToken: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
           refreshToken: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
           user: {
             id: "user_123",
             email: "admin@pizzeria.be",
             firstName: "Jean",
             lastName: "Dupont",
             organizations: [...]
           }
         }

Client stocke accessToken en localStorage/sessionStorage
```

### 1.3 Subsequent Requests

```
Client
  │
  ├─→ POST /graphql
  │    Authorization: Bearer <accessToken>
  │    {
  │      query: "{ stores { id name } }"
  │    }
  │
  └─→ Backend Middleware
      │
      ├─ Extraire token du header
      ├─ Verify JWT signature (using SECRET)
      ├─ Verify not expired
      ├─ Extraire payload (user_id, organizations)
      │
      ├─ Attacher au request context:
      │  req.user = { id, email, organizations, ... }
      │
      └─ Passer au resolver

Resolver:
  │
  ├─ Vérifier req.user existe (authenticated)
  ├─ Vérifier user a permission pour la query
  ├─ Exécuter query
  │
  └─ Retourner données
```

### 1.4 Refresh Token

```
Si accessToken expiré:

Client
  │
  ├─→ POST /graphql/auth/refresh
  │    {
  │      refreshToken: "eyJ0eXAi..."
  │    }
  │
  └─→ Backend
      │
      ├─ Vérifier refreshToken
      ├─ Vérifier pas révoqué
      │
      ├─ Créer nouveau accessToken
      │
      └─ Response:
         {
           accessToken: "eyJ0eXAi...",
           expiresIn: 86400
         }
```

### 1.5 Logout

```
Client
  │
  ├─→ POST /graphql/auth/logout
  │    Authorization: Bearer <accessToken>
  │
  └─→ Backend
      │
      ├─ Révoquer refreshToken (le marquer comme blacklisted)
      ├─ Optionnel: ajouter accessToken à blacklist
      │
      └─ Response:
         {
           success: true
         }

Client efface tokens du localStorage
```

---

## 2. JWT STRUCTURE

### Access Token (24h)

```json
{
  "sub": "user_123",
  "email": "admin@pizzeria.be",
  "firstName": "Jean",
  "lastName": "Dupont",
  "avatar": "https://...",
  "organizations": [
    {
      "id": "org_123",
      "slug": "pizzeria-xy",
      "name": "Pizza Dupont",
      "role": "OWNER",
      "stores": ["store_namur_123", "store_charleroi_456"]
    },
    {
      "id": "org_456",
      "slug": "nightshop-xy",
      "name": "Night Shop",
      "role": "MANAGER",
      "stores": ["store_bruxelles_789"]
    }
  ],
  "permissions": [
    "organization.read",
    "organization.write",
    "store.read",
    "store.write",
    "product.read",
    "product.write",
    "order.read",
    "order.write",
    "user.read",
    "user.write",
    "theme.read",
    "theme.write"
  ],
  "iat": 1704067200,
  "exp": 1704153600,
  "iss": "https://saas-platform.com",
  "aud": "dashboard"
}
```

### Refresh Token (7 days)

```json
{
  "sub": "user_123",
  "type": "refresh",
  "iat": 1704067200,
  "exp": 1704672000,
  "iss": "https://saas-platform.com"
}
```

---

## 3. MIDDLEWARE D'AUTHENTIFICATION

### TypeScript / Express

```typescript
// middleware/auth.middleware.ts

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

interface UserPayload {
  sub: string;
  email: string;
  organizations: Array<{
    id: string;
    slug: string;
    role: string;
    stores: string[];
  }>;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
      organizationId?: string;
      storeId?: string;
    }
  }
}

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extraire token du header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid token' });
    }

    const token = authHeader.substring(7);

    // Vérifier token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as UserPayload;

    // Attacher user au request
    req.user = decoded;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};
```

---

## 4. TENANT ISOLATION MIDDLEWARE

### Vérifier que user a accès à l'organization/store

```typescript
// middleware/tenant.middleware.ts

export const tenantMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Extraire organization_id de la query/mutation
  const organizationId = req.body?.variables?.organizationId || 
                        req.query?.organizationId ||
                        req.params?.organizationId;

  if (!organizationId) {
    // Pas d'organization spécifiée, OK pour certaines queries
    return next();
  }

  // Vérifier que user a accès à cette organization
  const hasAccess = req.user?.organizations.some(
    (org) => org.id === organizationId
  );

  if (!hasAccess) {
    return res.status(403).json({
      error: 'Access denied to this organization'
    });
  }

  // Attacher organization ID au request
  req.organizationId = organizationId;

  next();
};

// Similaire pour stores
export const storeAccessMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const storeId = req.body?.variables?.storeId || 
                 req.query?.storeId ||
                 req.params?.storeId;

  if (!storeId) {
    return next();
  }

  // Vérifier que user a accès à ce store
  const hasAccess = req.user?.organizations.some((org) =>
    org.stores.includes(storeId)
  );

  if (!hasAccess) {
    return res.status(403).json({
      error: 'Access denied to this store'
    });
  }

  req.storeId = storeId;
  next();
};
```

---

## 5. GUARDS GRAPHQL

### For GraphQL (Yoga)

```typescript
// graphql/guards.ts

import { GraphQLError } from 'graphql';

interface Context {
  user?: UserPayload;
  organizationId?: string;
  storeId?: string;
}

export const requireAuthGuard = (next: any) => {
  return (root: any, args: any, context: Context, info: any) => {
    if (!context.user) {
      throw new GraphQLError('Authentication required', {
        extensions: { code: 'UNAUTHENTICATED' },
      });
    }
    return next(root, args, context, info);
  };
};

export const requirePermissionGuard = (permission: string) => {
  return (next: any) => {
    return (root: any, args: any, context: Context, info: any) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      if (!context.user.permissions.includes(permission)) {
        throw new GraphQLError('Insufficient permissions', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      return next(root, args, context, info);
    };
  };
};

export const requireRoleGuard = (roles: string[]) => {
  return (next: any) => {
    return (root: any, args: any, context: Context, info: any) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      const userOrg = context.user.organizations.find(
        (org) => org.id === context.organizationId
      );

      if (!userOrg || !roles.includes(userOrg.role)) {
        throw new GraphQLError('Insufficient role', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      return next(root, args, context, info);
    };
  };
};

export const requireStoreAccessGuard = (next: any) => {
  return (root: any, args: any, context: Context, info: any) => {
    if (!context.user || !context.storeId) {
      throw new GraphQLError('Store context required', {
        extensions: { code: 'BAD_REQUEST' },
      });
    }

    const hasAccess = context.user.organizations.some((org) =>
      org.stores.includes(context.storeId!)
    );

    if (!hasAccess) {
      throw new GraphQLError('Access denied to this store', {
        extensions: { code: 'FORBIDDEN' },
      });
    }

    return next(root, args, context, info);
  };
};
```

---

## 6. RBAC - ROLE BASED ACCESS CONTROL

### Roles & Permissions Matrix

```
┌────────────────────────────────────────────────────────────────┐
│                     ROLES & PERMISSIONS                        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ SUPER_ADMIN (Platform admin)                                  │
│ ├── organizations:list                                        │
│ ├── organizations:read                                        │
│ ├── organizations:suspend                                     │
│ ├── organizations:delete                                      │
│ ├── users:list                                                │
│ ├── users:read                                                │
│ ├── users:create                                              │
│ ├── subscriptions:manage                                      │
│ ├── system:audit                                              │
│ └── system:config                                             │
│                                                                │
│ OWNER (Organization owner)                                    │
│ ├── organization:read                                         │
│ ├── organization:write                                        │
│ ├── stores:create                                             │
│ ├── stores:read                                               │
│ ├── stores:write                                              │
│ ├── stores:delete                                             │
│ ├── users:invite                                              │
│ ├── users:read                                                │
│ ├── users:write                                               │
│ ├── users:revoke                                              │
│ ├── products:read                                             │
│ ├── products:write                                            │
│ ├── orders:read                                               │
│ ├── orders:write                                              │
│ ├── payments:read                                             │
│ ├── themes:read                                               │
│ ├── themes:write                                              │
│ ├── statistics:read                                           │
│ ├── billing:read                                              │
│ └── billing:write                                             │
│                                                                │
│ MANAGER (Store manager)                                       │
│ ├── stores:read (own stores)                                  │
│ ├── stores:write (own stores)                                 │
│ ├── products:read (own stores)                                │
│ ├── products:write (own stores)                               │
│ ├── orders:read (own stores)                                  │
│ ├── orders:write (own stores)                                 │
│ ├── themes:read (own stores)                                  │
│ ├── themes:write (own stores)                                 │
│ ├── employees:read (own stores)                               │
│ ├── employees:write (own stores)                              │
│ └── statistics:read (own stores)                              │
│                                                                │
│ EMPLOYEE (Store employee)                                     │
│ ├── orders:read (own stores)                                  │
│ ├── orders:write (change status only)                         │
│ ├── products:read (own stores)                                │
│ └── (limited printing/terminal access)                        │
│                                                                │
│ ACCOUNTANT (Finance only)                                     │
│ ├── payments:read                                             │
│ ├── invoices:read                                             │
│ ├── statistics:read (finance only)                            │
│ └── billing:read                                              │
│                                                                │
│ THEME_DEVELOPER (Agency/developer)                            │
│ ├── themes:read                                               │
│ ├── themes:write                                              │
│ ├── themes:preview                                            │
│ ├── themes:publish                                            │
│ ├── products:read (for preview)                               │
│ ├── stores:read (metadata only)                               │
│ ├── (NO orders, payments, customers)                          │
│ └── (NO organization settings)                                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Permission Checking Code

```typescript
// services/permission.service.ts

export class PermissionService {
  // Static permissions map
  private static PERMISSIONS_BY_ROLE = {
    SUPER_ADMIN: [
      'organizations:list',
      'organizations:read',
      'organizations:suspend',
      'organizations:delete',
      'users:list',
      'users:read',
      'subscriptions:manage',
      'system:audit',
    ],
    OWNER: [
      'organization:read',
      'organization:write',
      'stores:create',
      'stores:read',
      'stores:write',
      'stores:delete',
      'users:invite',
      'users:read',
      'users:write',
      'users:revoke',
      'products:read',
      'products:write',
      'orders:read',
      'orders:write',
      'payments:read',
      'themes:read',
      'themes:write',
      'statistics:read',
      'billing:read',
      'billing:write',
    ],
    MANAGER: [
      'stores:read',
      'stores:write',
      'products:read',
      'products:write',
      'orders:read',
      'orders:write',
      'themes:read',
      'themes:write',
      'employees:read',
      'employees:write',
      'statistics:read',
    ],
    EMPLOYEE: [
      'orders:read',
      'orders:write',
      'products:read',
    ],
    THEME_DEVELOPER: [
      'themes:read',
      'themes:write',
      'themes:preview',
      'themes:publish',
      'products:read',
      'stores:read',
    ],
  };

  // Check if user has permission
  static hasPermission(
    userPermissions: string[],
    requiredPermission: string
  ): boolean {
    return userPermissions.includes(requiredPermission);
  }

  // Check if user has any of multiple permissions
  static hasAnyPermission(
    userPermissions: string[],
    requiredPermissions: string[]
  ): boolean {
    return requiredPermissions.some((p) =>
      userPermissions.includes(p)
    );
  }

  // Check if user has all of multiple permissions
  static hasAllPermissions(
    userPermissions: string[],
    requiredPermissions: string[]
  ): boolean {
    return requiredPermissions.every((p) =>
      userPermissions.includes(p)
    );
  }

  // Get permissions for a role
  static getPermissionsForRole(role: string): string[] {
    return this.PERMISSIONS_BY_ROLE[role as keyof typeof this.PERMISSIONS_BY_ROLE] || [];
  }

  // Merge permissions from role + custom store permissions
  static mergePermissions(
    rolePermissions: string[],
    customPermissions?: string[]
  ): string[] {
    if (!customPermissions) return rolePermissions;
    return Array.from(new Set([...rolePermissions, ...customPermissions]));
  }
}
```

---

## 7. QUERY FILTERING PAR TENANT

### Resolver example

```typescript
// resolvers/store.resolver.ts

export const storeResolver = {
  Query: {
    stores: requireAuthGuard((root, args, context: Context) => {
      const { user } = context;

      // User must be authenticated
      if (!user) {
        throw new GraphQLError('Authentication required');
      }

      // Get all stores accessible to user
      const accessibleStores = user.organizations.flatMap(
        (org) => org.stores
      );

      // Query database with store ID filter
      return prisma.store.findMany({
        where: {
          id: {
            in: accessibleStores,
          },
        },
      });
    }),

    store: requireAuthGuard((root, args: { id: string }, context: Context) => {
      const { user } = context;

      if (!user) {
        throw new GraphQLError('Authentication required');
      }

      // Check user has access to this store
      const hasAccess = user.organizations.some((org) =>
        org.stores.includes(args.id)
      );

      if (!hasAccess) {
        throw new GraphQLError('Access denied', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      // Query with explicit authorization check
      return prisma.store.findFirst({
        where: {
          id: args.id,
          // Also verify at DB level
          organization: {
            memberships: {
              some: {
                userId: user.sub,
              },
            },
          },
        },
      });
    }),
  },

  Mutation: {
    updateStore: requirePermissionGuard('stores:write')(
      async (root, args: { id: string; input: any }, context: Context) => {
        const { user } = context;

        if (!user) {
          throw new GraphQLError('Authentication required');
        }

        // Verify user has write permission for this store
        const store = await prisma.store.findFirst({
          where: {
            id: args.id,
          },
          include: {
            organization: {
              include: {
                memberships: {
                  where: { userId: user.sub },
                },
              },
            },
          },
        });

        if (!store) {
          throw new GraphQLError('Store not found');
        }

        if (store.organization.memberships.length === 0) {
          throw new GraphQLError('Access denied', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        // Verify role has permission
        const membership = store.organization.memberships[0];
        const permissions = PermissionService.getPermissionsForRole(
          membership.role
        );

        if (!PermissionService.hasPermission(permissions, 'stores:write')) {
          throw new GraphQLError('Insufficient permissions', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        // Update
        return prisma.store.update({
          where: { id: args.id },
          data: args.input,
        });
      }
    ),
  },
};
```

---

## 8. SECURITY BEST PRACTICES

### Password Hashing

```typescript
import bcrypt from 'bcrypt';

// Hash password on signup
const hashedPassword = await bcrypt.hash(password, 10); // 10 rounds

// Verify password on login
const isValid = await bcrypt.compare(inputPassword, storedHash);
```

### JWT Secret Management

```typescript
// .env
JWT_SECRET=your-super-secret-key-min-32-chars-long
JWT_REFRESH_SECRET=your-refresh-secret-key-min-32-chars-long
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
```

### Token Blacklist (for logout)

```typescript
// service/token-blacklist.service.ts

import Redis from 'ioredis';

export class TokenBlacklistService {
  private redis = new Redis();

  async revoke(token: string, expiresIn: number): Promise<void> {
    // Add token to blacklist (Redis) with TTL
    await this.redis.setex(
      `blacklist:${token}`,
      expiresIn,
      'true'
    );
  }

  async isBlacklisted(token: string): Promise<boolean> {
    const result = await this.redis.get(`blacklist:${token}`);
    return result !== null;
  }
}

// Usage in middleware
const isBlacklisted = await blacklistService.isBlacklisted(token);
if (isBlacklisted) {
  throw new GraphQLError('Token has been revoked');
}
```

### Rate Limiting (Login attempts)

```typescript
// middleware/rate-limit.ts

import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 login attempts per window
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
```

### HTTPS / TLS

```
- All communication must be HTTPS (TLS 1.3)
- Secure cookies: httpOnly, Secure, SameSite=Strict
- CORS: whitelist only known origins
```

### Audit Logging

```typescript
// middleware/audit-log.ts

export const auditLog = async (
  userId: string,
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  oldValue?: any,
  newValue?: any,
  ipAddress?: string,
  userAgent?: string
) => {
  await prisma.auditLog.create({
    data: {
      userId,
      organizationId,
      action,
      resourceType,
      resourceId,
      oldValue,
      newValue,
      ipAddress,
      userAgent,
    },
  });
};
```

---

## 9. SETUP EXAMPLE

### Complete Auth Service

```typescript
// services/auth.service.ts

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';

interface LoginInput {
  email: string;
  password: string;
}

interface SignupInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export class AuthService {
  async signup(input: SignupInput) {
    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new Error('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(input.password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: input.email,
        password: hashedPassword,
        firstName: input.firstName,
        lastName: input.lastName,
      },
    });

    // Create organization for this user
    const org = await prisma.organization.create({
      data: {
        slug: this.generateSlug(input.firstName, input.lastName),
        name: `${input.firstName}'s Business`,
      },
    });

    // Create membership (OWNER)
    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: 'OWNER',
      },
    });

    // Send verification email
    // await sendVerificationEmail(user.email, verificationToken);

    return {
      success: true,
      userId: user.id,
      message: 'Signup successful. Please verify your email.',
    };
  }

  async login(input: LoginInput) {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        memberships: {
          include: {
            organization: true,
            storeAccess: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check email verified
    if (!user.emailVerified) {
      throw new Error('Please verify your email first');
    }

    // Verify password
    const isValid = await bcrypt.compare(input.password, user.password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Create JWT payload
    const organizations = user.memberships.map((m) => ({
      id: m.organizationId,
      slug: m.organization.slug,
      name: m.organization.name,
      role: m.role,
      stores: m.storeAccess.map((sa) => sa.storeId),
    }));

    // Get permissions for each role
    const permissions = user.memberships.flatMap((m) =>
      PermissionService.getPermissionsForRole(m.role)
    );

    const payload = {
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      organizations,
      permissions: Array.from(new Set(permissions)), // unique
    };

    // Create tokens
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });

    const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET!,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      }
    );

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 86400, // 24h in seconds
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        organizations,
      },
    };
  }

  async refreshToken(token: string) {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_REFRESH_SECRET!
      ) as { sub: string };

      // Fetch fresh user data
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        include: {
          memberships: {
            include: {
              organization: true,
              storeAccess: true,
            },
          },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Recreate payload
      const organizations = user.memberships.map((m) => ({
        id: m.organizationId,
        slug: m.organization.slug,
        name: m.organization.name,
        role: m.role,
        stores: m.storeAccess.map((sa) => sa.storeId),
      }));

      const permissions = user.memberships.flatMap((m) =>
        PermissionService.getPermissionsForRole(m.role)
      );

      const payload = {
        sub: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        organizations,
        permissions: Array.from(new Set(permissions)),
      };

      const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      });

      return {
        accessToken: newAccessToken,
        expiresIn: 86400,
      };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  private generateSlug(firstName: string, lastName: string): string {
    return `${firstName.toLowerCase()}-${lastName.toLowerCase()}-${Date.now()}`;
  }
}
```

---

## RÉSUMÉ

| Aspect | Détail |
|--------|--------|
| **Auth** | JWT + Refresh Token |
| **Verification** | Email verification required |
| **Password** | Bcrypt hashing (10 rounds) |
| **Token expiry** | Access: 24h, Refresh: 7d |
| **Multi-tenant** | Tenant isolation via middleware |
| **RBAC** | Role-based permissions matrix |
| **Audit** | All sensitive actions logged |
| **Rate limiting** | Login attempts limited |
| **Security** | HTTPS, httpOnly cookies, CORS |

---

**PROCHAINE ÉTAPE** : Theme Engine ? 👉
