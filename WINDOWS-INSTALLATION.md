# 📋 GUIDE D'INSTALLATION EXACTE - WINDOWS

**Tu es ici**: `C:\projet` (vide)
**Objectif**: Avoir un SaaS fonctionnel en local après 30 minutes

---

## ✅ PRÉREQUIS (5 minutes)

Avant de commencer, vérifie que tu as:

```bash
# Ouvre PowerShell (Windows) ou CMD et teste:

node --version
# Doit afficher: v20.x.x (ou plus recent)
# Si pas installé: https://nodejs.org/en/ (télécharge LTS 20+)

npm --version
# Doit afficher: 10.x.x (ou plus recent)

docker --version
# Doit afficher: Docker version 20.x.x (ou plus recent)
# Si pas installé: https://www.docker.com/products/docker-desktop

docker-compose --version
# Doit afficher: Docker Compose version 2.x.x (ou plus recent)
```

**Si une commande ne fonctionne pas:**
- Installe le logiciel manquant
- Redémarre PowerShell/CMD après installation
- Réessaye la commande

---

## 🚀 ÉTAPES D'INSTALLATION (25 minutes)

### ÉTAPE 1: Télécharger le projet (2 minutes)

Tu as deux options:

**Option A: Via Git (recommandé)**
```powershell
cd C:\projet
git clone https://github.com/ton-repo/saas-dev .
# (ou copie les fichiers du /home/claude/saas-dev)
```

**Option B: Copier manuellement les fichiers**
- Récupère tous les fichiers de `/home/claude/saas-dev/`
- Copie-les dans `C:\projet\`

**Résultat attendu:**
```
C:\projet\
├── backend/
├── frontend/
├── docker-compose.yml
├── README.md
├── JOUR2-GUIDE.md
└── START-HERE.md
```

**Vérification:**
```powershell
cd C:\projet
ls  # ou dir sur CMD
# Tu dois voir les dossiers backend, frontend, docker-compose.yml, etc.
```

---

### ÉTAPE 2: Démarrer la base de données (5 minutes)

**Ouvre PowerShell** et fais:

```powershell
cd C:\projet

# Démarre PostgreSQL + Redis + PgAdmin
docker-compose up -d

# Attends 10-15 secondes, puis vérifie:
docker ps

# Tu dois voir 3 conteneurs:
# saas_postgres
# saas_redis
# saas_pgadmin
```

**Si ça ne fonctionne pas:**
```powershell
# Redémarre Docker Desktop
# Puis réessaye:
docker-compose up -d
```

✅ **Les services sont maintenant en arrière-plan**

---

### ÉTAPE 3: Installer et démarrer le BACKEND (8 minutes)

**Ouvre une NOUVELLE fenêtre PowerShell** (ne ferme pas celle d'avant):

```powershell
# Navigate au dossier backend
cd C:\projet\backend

# Installe les dépendances
npm install
# Cela va prendre 3-4 minutes... c'est normal, attends ☕

# Génère Prisma Client
npx prisma generate
# Doit afficher: ✓ Generated Prisma Client

# Crée la base de données + tables
npx prisma migrate dev --name initial
# Répond "y" si on te demande

# Démarre le serveur
npm run dev

# Tu dois voir à la fin:
# 🚀 Server running on http://localhost:3001
# [timestamp] INFO Testing database connection...
# [timestamp] INFO ✅ Database connected
```

✅ **Laisse cette fenêtre ouverte** (c'est le serveur backend)

---

### ÉTAPE 4: Installer et démarrer le FRONTEND (10 minutes)

**Ouvre une TROISIÈME fenêtre PowerShell** (garde les 2 autres ouvertes):

```powershell
# Navigate au dossier frontend
cd C:\projet\frontend

# Installe les dépendances
npm install
# Cela va prendre 3-5 minutes... attends ☕

# Démarre le serveur
npm run dev

# Tu dois voir:
# ▲ Next.js 14.0.0
# Ready in 2.5s
# ► Local: http://localhost:3000
```

✅ **Laisse cette fenêtre ouverte** (c'est le serveur frontend)

---

## 🎉 VÉRIFICATION FINALE (2 minutes)

Maintenant tu dois avoir **3 fenêtres ouvertes**:
1. Docker (silencieuse)
2. Backend (npm run dev)
3. Frontend (npm run dev)

**Teste que tout fonctionne:**

```powershell
# Ouvre une QUATRIÈME fenêtre PowerShell:

# Test 1: Backend health check
curl http://localhost:3001/health
# Tu dois voir: {"status":"ok","timestamp":"..."}

# Test 2: Frontend accesible
# Ouvre un navigateur et va à: http://localhost:3000
# Tu dois voir la homepage "SaaS Local"

# Test 3: Database GUI (optionnel)
# Ouvre un navigateur et va à: http://localhost:5050
# Login: admin@example.com / admin
```

**Si tout fonctionne:** 🎉 **TU ES PRÊT!**

---

## 📊 RÉSUMÉ: OÙ ACCÉDER À TON PROJET

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | Ton app (page d'accueil) |
| **Backend API** | http://localhost:3001/health | Vérifie que le serveur répond |
| **Database GUI** | http://localhost:5050 | Voir/modifier la DB (optionnel) |
| **PostgreSQL** | localhost:5432 | Base de données |
| **Redis** | localhost:6379 | Cache/queue |

---

## 🔑 FICHIERS IMPORTANTS À CONNAÎTRE

Dans `C:\projet\`:

```
backend/
├── src/
│  ├── app.ts           ← Main Express app
│  ├── server.ts        ← Entry point
│  ├── config/env.ts    ← Configuration
│  └── services/auth.service.ts ← Auth logic
├── prisma/schema.prisma ← Database models
└── package.json        ← Dependencies

frontend/
├── app/
│  ├── page.tsx         ← Homepage
│  ├── layout.tsx       ← Layout
│  └── globals.css      ← Styles
└── package.json        ← Dependencies
```

---

## 🚦 WORKFLOW QUOTIDIEN (pour demain et après)

Chaque fois que tu veux développer:

```powershell
# Terminal 1 - Docker (une seule fois au démarrage du PC)
cd C:\projet
docker-compose up -d

# Terminal 2 - Backend
cd C:\projet\backend
npm run dev

# Terminal 3 - Frontend
cd C:\projet\frontend
npm run dev

# Terminal 4 - Tests
curl http://localhost:3001/health
```

---

## 🆘 SI QUELQUE CHOSE NE FONCTIONNE PAS

### Erreur: "port 3000 already in use"

```powershell
# Trouve le process qui utilise le port
netstat -ano | findstr :3000

# Tue-le (remplace 1234 par le PID):
taskkill /PID 1234 /F

# Réessaye
npm run dev
```

### Erreur: "DATABASE_URL not found"

```powershell
# Vérifie que le fichier .env existe dans backend/
cd C:\projet\backend
ls .env

# S'il n'existe pas, crée-le:
# Copie .env.example → .env
# Configure les valeurs correctes
```

### Erreur: "Docker daemon not running"

```powershell
# Ouvre Docker Desktop
# Attends qu'il soit prêt (logo animé en haut à droite)
# Réessaye
```

### Erreur: "npm ERR! code ERESOLVE"

```powershell
# Réinstalle les dépendances
rm -r node_modules package-lock.json
npm install
```

### Erreur: "Cannot find module '@prisma/client'"

```powershell
cd C:\projet\backend
npx prisma generate
npm run dev
```

---

## ✅ CHECKLIST DE SUCCÈS

- [ ] `docker ps` affiche 3 conteneurs
- [ ] `curl http://localhost:3001/health` retourne du JSON
- [ ] `http://localhost:3000` affiche la page d'accueil
- [ ] 3 fenêtres PowerShell actives (Docker, backend, frontend)
- [ ] Pas d'erreurs dans les consoles

---

## 📚 PROCHAINE ÉTAPE

Une fois que tout fonctionne:

1. Lis `C:\projet\JOUR2-GUIDE.md`
2. Commence à coder les endpoints Auth API
3. Reviens si tu as des questions!

---

## 🎯 RÉSUMÉ EN 3 COMMANDES

```powershell
# Terminal 1
cd C:\projet && docker-compose up -d

# Terminal 2
cd C:\projet\backend && npm install && npx prisma migrate dev --name initial && npm run dev

# Terminal 3
cd C:\projet\frontend && npm install && npm run dev

# Puis visite:
# http://localhost:3000 ✅
```

---

**Tu as des questions? Poste-les!** 🚀
