# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ZupEat (first platform of the ZupOne group): multi-tenant online ordering for local shops — customers order (even without an account), merchants manage catalog/orders, drivers deliver. Stripe payments via webhooks, weekly SEPA payouts. Docs, code identifiers and comments are largely **in French** — keep that convention.

Layout:
- `backend/` — Express + TypeScript + Prisma (PostgreSQL), Redis, Jest. Read `backend/ARCHITECTURE.md` before non-trivial changes.
- `frontend/` — Next.js 16 (app router), React 19, Tailwind 3, next-intl. Read `frontend/ARCHITECTURE.md`.
- `mobile/apps/{customer,delivery,merchant}` — Expo apps (each has its own AGENTS.md/CLAUDE.md).
- Root `*.md` files hold domain knowledge (`CONNAISSANCES-PROJET.md`, webhooks, accounting, deployment on Scaleway via `deploy/`).

## Commands

Local services (Postgres :5432, Redis :6379, Mailpit :8025): `./start.sh` / `./stop.sh` (docker-compose).

Backend (`cd backend`):
```bash
npm run dev                  # prisma migrate deploy + tsx watch (API on :3001)
npx tsc --noEmit             # typecheck
npm run build                # prisma generate + tsc + esbuild bundles to dist/
npm test                     # jest --runInBand (needs full .env and a real DB)
npx jest path/to/file.test.ts -t "test name"   # single test
npm run lint
npx prisma migrate dev       # after editing prisma/schema.prisma
npm run create-superowner
```

Frontend (`cd frontend`):
```bash
npm run dev                  # :3000, expects API on :3001
npx tsc --noEmit && npm run lint && npm run build
VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 node scripts/verif-<name>.mjs
```
`scripts/verif-*.mjs` are Playwright end-to-end checks against running site+API (exposed as `npm run verif:<name>`); the project proves major features by adding one.

Mobile: `npm start` (expo) and `npm run lint` in each app.

## Backend architecture

Organized **by domain**, not by file type: `src/modules/<domain>/` holds routes, services, jobs, middlewares and tests for that domain (auth, merchants, stores, catalog, orders, payments, payouts, delivery, drivers, realtime, superowner…). `src/app.ts` mounts all routers (mount order matters); `src/server.ts` starts HTTP, realtime and background jobs.

Rules:
- Routes are thin (parse, validate with Zod, call service, respond); business logic lives in services. Errors go through `ApiError`.
- Import specific files — there are no per-module `index.ts` barrels. Avoid import cycles between modules.
- Shared technical pieces stay outside modules at fixed paths: `middleware/errorHandler`, `config/logger`, `config/env`, `services/db` (Prisma client).
- `utils/` is pure/stateless and must not import modules.
- Routes use `authMiddleware` and must check the resource belongs to the caller (tenant isolation, "chacun chez soi"). Admin actions that mutate data call `journaliser` (audit log).
- Check `jest.mock` paths when moving files.

## Frontend notes

This Next.js version has breaking changes (e.g. `middleware.ts` is `proxy.ts`). Consult `frontend/node_modules/next/dist/docs/` before touching routing, server components, caching or metadata. The app is split into "espaces" (customer/storefront, merchant, driver, superowner) with domain-based routing — see `frontend/ARCHITECTURE.md`. Translations live in `frontend/messages/`.
