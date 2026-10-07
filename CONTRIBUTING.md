# Guide de Contribution - Zupone

Merci de vouloir contribuer à Zupone ! Ce guide te montre comment participer au projet de manière efficace et sécurisée.

## 📋 Table des matières

1. [Code de Conduite](#code-de-conduite)
2. [Comment Commencer](#comment-commencer)
3. [Processus de Contribution](#processus-de-contribution)
4. [Standards de Code](#standards-de-code)
5. [Directives de Commit](#directives-de-commit)
6. [Soumettre une Pull Request](#soumettre-une-pull-request)

---

## Code de Conduite

Voir [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) pour les règles de conduite attendues.

---

## Comment Commencer

### Prérequis

- **Node.js** 18+ et npm 9+
- **Docker** (pour PostgreSQL et Redis)
- **Git**

### Installation locale

```bash
# 1. Clone le dépôt
git clone https://github.com/AmirGames/projet.git
cd projet

# 2. Installe les dépendances
npm install

# 3. Démarre les services (PostgreSQL, Redis, Mailpit)
./start.sh

# 4. Configure l'environnement
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 5. Lance les migrations de base de données
cd backend && npx prisma migrate dev && cd ..

# 6. Démarre l'API et le frontend
npm run dev
```

L'API sera accessible à `http://localhost:3001` et le frontend à `http://localhost:3000`.

Pour plus de détails, voir [docs/SETUP.md](docs/SETUP.md).

---

## Processus de Contribution

### 1. Ouvre une Issue

Avant de commencer à coder :

- **Bug** : décris le problème, les étapes pour le reproduire, et le comportement attendu
- **Feature** : explique le besoin, le cas d'usage, et les impacts potentiels
- **Documentation** : indique ce qui est flou ou manquant

### 2. Crée une branche

```bash
git checkout -b feature/nom-descriptif
# ou
git checkout -b fix/nom-descriptif
```

**Convention de nommage** :
- `feature/xyz` pour une nouvelle fonctionnalité
- `fix/xyz` pour un bug
- `docs/xyz` pour la documentation
- `refactor/xyz` pour un refactoring

### 3. Code et Tests

Respecte les règles du projet (voir [CLAUDE.md](CLAUDE.md) et [Standards de Code](#standards-de-code) ci-dessous).

**Tests** :
```bash
# Backend
cd backend && npm test

# Frontend
cd frontend && npx tsc --noEmit && npm run lint
```

### 4. Commit avec un message clair

Voir [Directives de Commit](#directives-de-commit).

### 5. Push et ouvre une Pull Request

```bash
git push origin feature/nom-descriptif
```

Puis ouvre une PR sur GitHub en remplissant le template.

---

## Standards de Code

### TypeScript

- Pas de `any` sans justification (dans un commentaire)
- Typage strict : `tsconfig.json` avec `strict: true`
- Linter : `npx eslint` (backend et frontend)

### Architecture Backend

Voir [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md) pour les détails.

Règles clés :
- Organisation **par domaine métier** : `src/modules/<domaine>/`
- Routes fines (validation → service → infrastructure)
- Logique métier centralisée dans les services
- Erreurs via `ApiError` (pas d'exposition d'erreurs internes)

### Architecture Frontend

Voir [frontend/ARCHITECTURE.md](frontend/ARCHITECTURE.md) pour les détails.

Règles clés :
- Composants React 19, Next.js 16 (App Router)
- Thème **clair partout** (pas de dark mode)
- Traductions via `next-intl` (pas de texte en dur)
- Tailwind CSS 3 pour le styling

### Sécurité

**Jamais** :
- Exposer un secret, clé API, ou token
- Faire confiance au frontend pour l'autorisation
- Contourner les validations backend
- Committer `.env` ou données sensibles

Voir [CLAUDE.md](CLAUDE.md) section « Sécurité et cloisonnement ».

### Format de Code

```bash
# Lint
npm run lint

# Format (Prettier)
npm run format
```

---

## Directives de Commit

Utilise des messages clairs et descriptifs :

```
type(scope): description courte

Description plus détaillée si nécessaire (optionnel).
Explique le "pourquoi" pas seulement le "quoi".

Fixes #123
```

**Types** :
- `feat` : nouvelle fonctionnalité
- `fix` : correction de bug
- `docs` : documentation
- `style` : formatage, typage, linting (sans logique)
- `refactor` : restructuration sans changement de comportement
- `perf` : amélioration de performance
- `test` : tests ajoutés ou modifiés
- `chore` : dépendances, build, CI/CD

**Exemples** :

```
feat(orders): ajouter annulation de commande

Les clients peuvent maintenant annuler une commande jusqu'à 5 minutes après sa création.
Ajoute une nouvelle transition d'état et notifie le commerçant.

Fixes #456

feat(drivers): intégrer Google Maps pour la navigation
fix(payments): corriger calcul des frais Stripe
docs(setup): ajouter guide d'installation Docker
```

---

## Soumettre une Pull Request

### Template

```markdown
## Description
Explique ce que tu as changé et pourquoi.

## Type de changement
- [ ] Bug fix
- [ ] Feature
- [ ] Breaking change
- [ ] Documentation

## Comment tester ?
Décris les étapes pour vérifier que ça fonctionne.

## Checklist
- [ ] J'ai lu le CLAUDE.md
- [ ] Les tests passent (`npm test`)
- [ ] Pas de `any` sans justification
- [ ] Pas de secret committé
- [ ] Architecture respectée (domaines, services, erreurs)
- [ ] Messages de commit clairs
- [ ] Documentation mise à jour si nécessaire
```

### Avant de soumettre

1. **Tests** passent : `npm test`
2. **Lint** OK : `npm run lint`
3. **TypeScript** OK : `npx tsc --noEmit`
4. **Build** OK : `npm run build`
5. **Branche à jour** avec `main` : `git rebase origin/main`

### Après la soumission

- Réponds aux reviews rapidement
- Fais des commits additionnels pour les changements (pas d'amend + force push)
- Demande du feedback si tu as besoin

---

## Besoin d'aide ?

- **Questions** : ouvre une Discussion sur GitHub
- **Bug** : ouvre une Issue avec `[BUG]`
- **Feature** : ouvre une Issue avec `[FEATURE REQUEST]`
- **Docs** : ouvre une Issue avec `[DOCS]`

---

**Merci pour ta contribution !** 🙏
