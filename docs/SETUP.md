# Guide d'Installation - Zupone

Ce guide te montre comment installer et lancer Zupone en local pour le développement.

## 📋 Table des matières

1. [Prérequis](#prérequis)
2. [Installation](#installation)
3. [Services Locaux](#services-locaux)
4. [Lancement](#lancement)
5. [Vérifications](#vérifications)
6. [Troubleshooting](#troubleshooting)

---

## Prérequis

### Système d'exploitation
- **macOS** 10.15+, **Linux** (Ubuntu/Debian), ou **Windows** 10/11 (avec WSL2)

### Logiciels requis
- **Node.js** 18.17+ et **npm** 9+
  - [Télécharger Node.js LTS](https://nodejs.org/)
  - Vérifier : `node --version` et `npm --version`

- **Docker** et **Docker Compose**
  - [Télécharger Docker Desktop](https://www.docker.com/products/docker-desktop)
  - Vérifier : `docker --version` et `docker-compose --version`

- **Git**
  - [Télécharger Git](https://git-scm.com/)
  - Vérifier : `git --version`

### Optionnel mais recommandé
- **VS Code** avec extensions :
  - ESLint
  - Prettier - Code formatter
  - TypeScript Vue Plugin (Volar)
  - Thunder Client (pour tester l'API)

---

## Installation

### 1. Clone le dépôt

```bash
git clone https://github.com/AmirGames/projet.git
cd projet
```

### 2. Installe les dépendances

```bash
npm install
```

Cela installe les dépendances de :
- `backend/`
- `frontend/`
- `mobile/apps/customer/`
- `mobile/apps/merchant/`
- `mobile/apps/delivery/`

### 3. Configure les variables d'environnement

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

Puis ajuste les valeurs selon tes besoins (tokens Stripe, URLs, etc.).

**Attention** : ne commit jamais `.env` ni `.env.local`.

**ZupDrive** : `ZUPDRIVE_NOTIFICATIONS_WEBHOOK_SECRET` (≥ 32 caractères, vide par défaut) signe les accusés de notification du fournisseur d'envoi ; vide, le webhook `POST /api/zupdrive/notifications/webhooks/status` répond 503. Le paiement des courses utilise le webhook Stripe existant (`STRIPE_WEBHOOK_SECRET`).

---

## Services Locaux

### Démarrer les services

```bash
./start.sh
```

Cela démarre via Docker Compose :
- **PostgreSQL** (port 5432)
- **Redis** (port 6379)
- **Mailpit** (interface web à `http://localhost:8025`)

### Arrêter les services

```bash
./stop.sh
```

### Vérifier l'état

```bash
docker-compose ps
```

---

## Lancement

### 1. Initialise la base de données

```bash
cd backend
npx prisma migrate dev
npm run create-superowner
cd ..
```

Cela :
- Applique toutes les migrations
- Crée un compte superadmin pour accéder à l'administration

### 2. Démarre l'API et le frontend

```bash
npm run dev
```

Cela lance en parallèle :
- **Backend API** → `http://localhost:3001`
- **Frontend** → `http://localhost:3000`

### 3. (Optionnel) Démarre une app mobile

```bash
cd mobile/apps/customer
npm start
```

Puis suis les instructions pour iOS/Android.

---

## Vérifications

### API est accessible

```bash
curl http://localhost:3001/health
```

Réponse attendue : `{"status": "ok"}`

### Frontend est accessible

Ouvre `http://localhost:3000` dans le navigateur.

### Base de données est connectée

```bash
cd backend
npx prisma studio
```

Cela ouvre une interface pour explorer la base (port 5555).

### Redis fonctionne

```bash
redis-cli ping
```

Réponse attendue : `PONG`

### Mailpit reçoit les emails

Ouvre `http://localhost:8025` pour voir les emails envoyés en local.

---

## Commandes Courantes

### Backend

```bash
cd backend

# Développement
npm run dev

# Tests
npm test

# Lint
npm run lint

# TypeScript check
npx tsc --noEmit

# Build
npm run build

# Migrations Prisma
npx prisma migrate dev
npx prisma migrate reset  # ⚠️ Réinitialise la DB

# Prisma Studio (UI DB)
npx prisma studio

# Créer un superowner
npm run create-superowner
```

### Frontend

```bash
cd frontend

# Développement
npm run dev

# Tests TypeScript & Lint
npx tsc --noEmit && npm run lint

# Build
npm run build

# Vérifications E2E
VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 node scripts/verif-inscription.mjs
```

### Docker & Services

```bash
# Voir les logs
docker-compose logs -f postgres
docker-compose logs -f redis

# Arrêter un service
docker-compose stop postgres

# Redémarrer tous les services
./stop.sh && ./start.sh

# Réinitialiser complètement (⚠️ données perdues)
docker-compose down -v
./start.sh
```

---

## Structure du Projet

```
/
├── backend/               # API Node.js/Express
│   ├── src/modules/       # Domaines métier
│   ├── prisma/            # Schéma DB
│   └── package.json
├── frontend/              # Next.js frontend
│   ├── app/               # Routing App Router
│   └── package.json
├── mobile/
│   ├── apps/
│   │   ├── customer/      # App client
│   │   ├── merchant/      # App commerçant
│   │   └── delivery/      # App livreur
│   └── package.json
├── deploy/                # Infrastructure
├── docs/                  # Documentation
├── CLAUDE.md              # Règles du projet
└── package.json           # Root workspace
```

---

## Troubleshooting

### PostgreSQL n'arrive pas à démarrer

```bash
# Vérifier les logs
docker-compose logs postgres

# Réinitialiser complètement
docker-compose down -v
./start.sh
```

### Port 5432 déjà utilisé

Si PostgreSQL est déjà lancé en local :
```bash
# Arrêter PostgreSQL local (macOS)
brew services stop postgresql

# Ou modifier le port dans docker-compose.yml
```

### "Cannot find module" en backend

```bash
cd backend
npm install
npx tsc --noEmit
```

### Frontend ne se met pas à jour

```bash
# Efface cache Next.js
rm -rf frontend/.next

# Relance
cd frontend && npm run dev
```

### Erreur Prisma lors de migration

```bash
cd backend

# Réinitialiser la DB (données perdues)
npx prisma migrate reset

# Puis créer un superowner
npm run create-superowner
```

### Email non reçu en local

Mailpit reçoit tous les emails. Vérifie :
1. `http://localhost:8025` dans le navigateur
2. Les logs de l'API : `npm run dev` affiche les tentatives d'envoi

### Port 3000 ou 3001 déjà utilisé

```bash
# Tuer le processus
lsof -i :3000  # Voir quel process utilise le port
kill -9 <PID>

# Ou changer le port
PORT=3002 npm run dev
```

---

## Prochaines étapes

1. Lis [CLAUDE.md](../CLAUDE.md) pour comprendre l'architecture
2. Lis [backend/ARCHITECTURE.md](../backend/ARCHITECTURE.md)
3. Lis [frontend/ARCHITECTURE.md](../frontend/ARCHITECTURE.md)
4. Explore le code dans `backend/src/modules/`
5. Ouvre une Issue ou une Discussion si tu as des questions

---

**Prêt à contribuer ?** Voir [CONTRIBUTING.md](../CONTRIBUTING.md) pour les directives.
