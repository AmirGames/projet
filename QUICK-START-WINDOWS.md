## 🚀 LES 5 COMMANDES À EXÉCUTER (dans l'ordre!)

**Tu es dans**: `C:\projet` (vide)
**Objectif**: Tout est fonctionnel en 30 min

---

### ✅ PRÉREQUIS (Avant de commencer)

Ouvre **PowerShell** et vérifie:

```powershell
node --version     # Doit afficher v20.x.x (minimum)
npm --version      # Doit afficher 10.x.x (minimum)
docker --version   # Doit afficher Docker version 20.x
```

Si une commande ne fonctionne pas → installe le logiciel manquant

---

### 🔴 COMMANDE 1: Copier les fichiers du projet

**Option A: Avec Git**
```powershell
cd C:\projet
git clone https://github.com/ton-repo/saas-dev .
```

**Option B: Copier manuellement**
- Récupère tous les fichiers de `/home/claude/saas-dev/`
- Copie-les dans `C:\projet\`

**Vérifie que c'est bon:**
```powershell
cd C:\projet
dir
# Tu dois voir: backend/, frontend/, docker-compose.yml, README.md, etc.
```

---

### 🟠 COMMANDE 2: Démarrer Docker (Terminal 1)

```powershell
cd C:\projet
docker-compose up -d
```

**Attends 10 secondes, puis vérifie:**
```powershell
docker ps
# Tu dois voir 3 conteneurs: saas_postgres, saas_redis, saas_pgadmin
```

✅ **Laisse cette fenêtre PowerShell ouverte** (ou ferme-la, Docker tourne en arrière-plan)

---

### 🟡 COMMANDE 3: Setup Backend (Terminal 2 - NOUVELLE fenêtre)

```powershell
cd C:\projet\backend
npm install
npx prisma generate
npx prisma migrate dev --name initial
npm run dev
```

**Tu dois voir à la fin:**
```
🚀 Server running on http://localhost:3001
✅ Database connected
```

✅ **Laisse cette fenêtre ouverte** (c'est le serveur)

---

### 🟢 COMMANDE 4: Setup Frontend (Terminal 3 - NOUVELLE fenêtre)

```powershell
cd C:\projet\frontend
npm install
npm run dev
```

**Tu dois voir:**
```
▲ Next.js 14.0.0
Ready in 2.5s
Local: http://localhost:3000
```

✅ **Laisse cette fenêtre ouverte** (c'est le serveur)

---

### 🔵 COMMANDE 5: Vérifier que tout fonctionne (Terminal 4 - NOUVELLE fenêtre)

```powershell
# Test 1: Backend
curl http://localhost:3001/health
# Résultat attendu: {"status":"ok","timestamp":"..."}

# Test 2: Frontend (ouvre dans ton navigateur)
# http://localhost:3000
# Tu dois voir: Page d'accueil "SaaS Local" avec boutons Login/Signup
```

---

## 🎉 C'EST FAIT! TU AS:

✅ **Backend** sur http://localhost:3001
✅ **Frontend** sur http://localhost:3000
✅ **PostgreSQL** sur localhost:5432
✅ **Redis** sur localhost:6379
✅ **Database GUI** sur http://localhost:5050 (login: admin@example.com / admin)

---

## 📌 STRUCTURE APRÈS INSTALLATION

```
C:\projet\
├── backend/          (serveur API Express + Prisma + PostgreSQL)
├── frontend/         (app Next.js)
├── docker-compose.yml (PostgreSQL + Redis + PgAdmin)
├── START-HERE.md
├── JOUR2-GUIDE.md
├── README.md
└── ... (autres fichiers de config)
```

---

## 🔄 DEMAIN/APRÈS (Workflow quotidien)

Chaque fois que tu veux développer:

```powershell
# Terminal 1
cd C:\projet
docker-compose up -d

# Terminal 2
cd C:\projet\backend
npm run dev

# Terminal 3
cd C:\projet\frontend
npm run dev
```

---

## 🆘 PROBLÈMES COURANTS

| Problème | Solution |
|----------|----------|
| "Port 3000 already in use" | `taskkill /PID <pid> /F` |
| "Docker not running" | Ouvre Docker Desktop |
| "DATABASE_URL not found" | Crée `backend/.env` (copie `.env.example`) |
| npm ERR! | Supprime `node_modules` + `npm install` à nouveau |

---

## ⏱️ TEMPS ESTIMÉ

- Télécharger fichiers: 2 min
- Docker: 2 min
- Backend (npm install + setup): 5-8 min
- Frontend (npm install): 5-8 min
- Tests: 2 min

**Total: 20-25 minutes**

---

**C'est bon? Vas-y!** 🚀
