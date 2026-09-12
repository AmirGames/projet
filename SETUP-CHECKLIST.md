# ✅ SETUP CHECKLIST - JOUR 1

Chaque élément cochable pour valider l'installation

## 📦 Backend Setup

- [ ] `npm install` dans `backend/`
- [ ] `.env.example` -> `.env` copié
- [ ] `DATABASE_URL` configurée
- [ ] `JWT_SECRET` généré (>32 chars)
- [ ] `FRONTEND_URL` = http://localhost:3000
- [ ] `npx prisma generate` OK
- [ ] `npx prisma migrate dev --name initial` OK
- [ ] `npm run dev` lance sans erreur

### Backend Checklist Détaillée

**Fichiers créés:**
```
backend/
├── src/
│  ├── config/env.ts ✓
│  ├── config/logger.ts ✓
│  ├── middleware/errorHandler.ts ✓
│  ├── services/auth.service.ts ✓
│  ├── app.ts ✓
│  └── server.ts ✓
├── prisma/
│  └── schema.prisma ✓
├── package.json ✓
├── tsconfig.json ✓
├── .env.example ✓
└── .gitignore ✓
```

**Dépendances clés** (npm list):
```
✓ @prisma/client@^5.7.0
✓ express@^4.18.2
✓ typescript@^5.3.3
✓ zod@^3.22.4
✓ jsonwebtoken@^9.1.2
✓ bcrypt@^5.1.1
✓ winston@^3.11.0
```

---

## 📱 Frontend Setup

- [ ] `npm install` dans `frontend/`
- [ ] `.env.example` -> `.env.local` copié
- [ ] `NEXT_PUBLIC_API_URL` = http://localhost:3001
- [ ] `npm run dev` lance sans erreur
- [ ] Page d'accueil s'affiche sur http://localhost:3000

### Frontend Checklist Détaillée

**Fichiers créés:**
```
frontend/
├── app/
│  ├── layout.tsx ✓
│  ├── page.tsx ✓
│  └── globals.css ✓
├── next.config.js ✓
├── tsconfig.json ✓
├── tailwind.config.ts ✓
├── postcss.config.js ✓
├── .env.example ✓
└── .gitignore ✓
```

**Dépendances clés** (npm list):
```
✓ next@^14.0.0
✓ react@^18.2.0
✓ tailwindcss@^3.3.0
✓ @apollo/client@^3.8.0
✓ zustand@^4.4.0
✓ react-hook-form@^7.48.0
```

---

## 🐘 Database Setup

- [ ] Docker Desktop running
- [ ] `docker-compose up -d` réussi
- [ ] `docker ps` affiche postgres + redis
- [ ] PostgreSQL accessible (localhost:5432)
- [ ] Redis accessible (localhost:6379)
- [ ] PgAdmin accessible (http://localhost:5050)

### Services de vérification

```bash
# Vérifier Docker
docker ps
# Devrait afficher: saas_postgres, saas_redis, saas_pgadmin

# Vérifier PostgreSQL
psql -h localhost -U postgres -d saas_dev -c "SELECT 1"
# Réponse: (1 row)

# Vérifier Redis
redis-cli ping
# Réponse: PONG

# Vérifier PgAdmin
# Ouvrir: http://localhost:5050
# Login: admin@example.com / admin
```

---

## 🔗 Connectivity Tests

- [ ] `curl http://localhost:3001/health` retourne JSON
- [ ] `curl http://localhost:3000` retourne HTML
- [ ] Frontend peut requêter le backend (CORS OK)
- [ ] Backend peut accéder à la DB
- [ ] Logs affichent pas d'erreurs

### Test Commands

```bash
# Backend health
curl -s http://localhost:3001/health | jq .

# Frontend homepage
curl -s http://localhost:3000 | head -20

# Backend logs
# Terminal: npm run dev output devrait afficher:
# 🚀 Server running on http://localhost:3001
```

---

## 📚 Documentation

- [ ] `README.md` créé et lisible
- [ ] `JOUR2-GUIDE.md` créé
- [ ] `.env.example` complét dans backend + frontend
- [ ] Comments dans le code expliquent la structure

---

## ✅ Final Validation

### Startup Sequence (Une seule fois)

```bash
# Terminal 1: Database
cd /home/claude/saas-dev
docker-compose up -d
# Attendre 10s que tout soit prêt

# Vérifier
docker ps
curl http://localhost:5432  # Devrait timeout (normal, c'est DB)
```

### Development Sequence (Chaque jour de dev)

```bash
# Terminal 1: Backend
cd /home/claude/saas-dev/backend
npm run dev
# Attendre: "🚀 Server running on http://localhost:3001"

# Terminal 2: Frontend
cd /home/claude/saas-dev/frontend
npm run dev
# Attendre: "▲ Next.js 14.0.0 Ready in 2.5s"

# Terminal 3: Tests
curl http://localhost:3001/health
open http://localhost:3000
```

### Success Criteria

- [x] Backend demos hello world
- [x] Frontend renders homepage
- [x] Database connected
- [x] No console errors
- [x] Can reach all services

---

## 🆘 Troubleshooting

### Backend ne démarre pas

```bash
# Checker l'env
cat .env

# Vérifier Node version
node --version  # Devrait être 20+

# Réinstaller
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Database connection refused

```bash
# Vérifier Docker
docker ps | grep postgres

# Redémarrer
docker-compose restart postgres

# Attendre 10s et retry
```

### Port déjà utilisé (3000 ou 3001)

```bash
# Trouver le process
lsof -i :3000
lsof -i :3001

# Tuer
kill -9 <PID>
```

### TypeScript errors

```bash
# Backend
cd backend
npx tsc --noEmit

# Frontend
cd ../frontend
npx tsc --noEmit
```

---

## 📋 À télécharger / Préparer

- [ ] Postman (tester API)
- [ ] VS Code (ou IDE préféré)
- [ ] Git (si repos local)
- [ ] Compte SendGrid (pour Jour 3)
- [ ] Compte Stripe (pour Jour 5)
- [ ] Compte Cloudinary (pour uploads images)

---

## 🎉 Jour 1 Complété!

Si tous les ✅ sont cochés, vous êtes **prêts pour Jour 2** 🚀

Prochaine étape: `JOUR2-GUIDE.md` (Auth API endpoints)

---

**Last Updated**: Jour 1 Setup
**Status**: READY FOR DEVELOPMENT ✅
