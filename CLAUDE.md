# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

ZupEat (première plateforme du groupe ZupOne) : commande en ligne multi-commerçants pour les commerces de proximité — le client commande (même sans compte), le commerçant gère son catalogue et ses commandes, un livreur assure la course. Paiements Stripe confirmés par webhook, virements SEPA hebdomadaires. La documentation, les noms de code et les commentaires sont majoritairement **en français** : garder cette convention.

Organisation :
- `backend/` — Express + TypeScript + Prisma (PostgreSQL), Redis, Jest. Lire `backend/ARCHITECTURE.md` avant toute modification importante.
- `frontend/` — Next.js 16 (routeur `app/`), React 19, Tailwind 3, next-intl. Lire `frontend/ARCHITECTURE.md`.
- `mobile/apps/{customer,delivery,merchant}` — applications Expo (chacune a son AGENTS.md/CLAUDE.md).
- Les `*.md` à la racine contiennent la connaissance métier (`CONNAISSANCES-PROJET.md`, webhooks, comptabilité, déploiement Scaleway via `deploy/`).

## Commandes

Services locaux (Postgres :5432, Redis :6379, Mailpit :8025) : `./start.sh` / `./stop.sh` (docker-compose).

Backend (`cd backend`) :
```bash
npm run dev                  # prisma migrate deploy + tsx watch (API sur :3001)
npx tsc --noEmit             # typage
npm run build                # prisma generate + tsc + bundles esbuild dans dist/
npm test                     # jest --runInBand (exige un .env complet et une base réelle)
npx jest chemin/du/fichier.test.ts -t "nom du test"   # un seul test
npm run lint
npx prisma migrate dev       # après modification de prisma/schema.prisma
npm run create-superowner
```

Frontend (`cd frontend`) :
```bash
npm run dev                  # :3000, l'API doit tourner sur :3001
npx tsc --noEmit && npm run lint && npm run build
VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 node scripts/verif-<nom>.mjs
```
Les `scripts/verif-*.mjs` sont des vérifications de bout en bout Playwright contre le site et l'API en marche (exposées via `npm run verif:<nom>`) ; une fonctionnalité importante se prouve en en ajoutant un.

Mobile : `npm start` (expo) et `npm run lint` dans chaque application.

## Architecture du backend

Rangement **par domaine**, pas par type de fichier : `src/modules/<domaine>/` regroupe routes, services, jobs, middlewares et tests du domaine (auth, merchants, stores, catalog, orders, payments, payouts, delivery, drivers, realtime, superowner…). `src/app.ts` monte tous les routeurs (l'ordre de montage compte) ; `src/server.ts` démarre le serveur HTTP, le temps réel et les tâches de fond.

Règles :
- Une route fait peu (lit, valide avec Zod, appelle un service, répond) ; la logique métier va dans les services. Les erreurs passent par `ApiError`.
- Importer des fichiers précis — pas de `index.ts` par module. Éviter les cycles d'import entre modules.
- Les briques techniques partagées restent hors des modules, à emplacement fixe : `middleware/errorHandler`, `config/logger`, `config/env`, `services/db` (client Prisma).
- `utils/` est sans état et n'importe aucun module.
- Les routes utilisent `authMiddleware` et vérifient que la ressource appartient à l'appelant (cloisonnement « chacun chez soi »). Une action d'administration qui modifie des données appelle `journaliser`.
- Vérifier les chemins des `jest.mock` en déplaçant des fichiers.

## Frontend

Cette version de Next.js a des changements incompatibles (par ex. `middleware.ts` s'appelle `proxy.ts`). Consulter `frontend/node_modules/next/dist/docs/` avant de toucher au routage, aux composants serveur, au cache ou aux métadonnées. L'application est découpée en « espaces » (client/vitrine, commerçant, livreur, superowner) avec un routage par domaine — voir `frontend/ARCHITECTURE.md`. Les traductions sont dans `frontend/messages/`.
