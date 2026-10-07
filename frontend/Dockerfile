FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Les variables NEXT_PUBLIC_* sont inscrites dans le code envoyé au navigateur
# au moment du build : les passer au démarrage du conteneur ne change rien.
# Elles arrivent donc en arguments de build (voir docker-compose.prod.yml).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_ENABLE_STRIPE=true
ARG NEXT_PUBLIC_DOMAINE_GROUPE
ARG NEXT_PUBLIC_DOMAINE_PUBLIC
ARG NEXT_PUBLIC_DOMAINE_PRO
ARG NEXT_PUBLIC_DOMAINE_LIVREUR
ARG NEXT_PUBLIC_DOMAINE_VITRINE
ARG NEXT_PUBLIC_DOMAINE_DRIVE
ARG NEXT_PUBLIC_DOMAINE_CHAUFFEUR
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_ENABLE_STRIPE=$NEXT_PUBLIC_ENABLE_STRIPE \
    NEXT_PUBLIC_DOMAINE_GROUPE=$NEXT_PUBLIC_DOMAINE_GROUPE \
    NEXT_PUBLIC_DOMAINE_PUBLIC=$NEXT_PUBLIC_DOMAINE_PUBLIC \
    NEXT_PUBLIC_DOMAINE_PRO=$NEXT_PUBLIC_DOMAINE_PRO \
    NEXT_PUBLIC_DOMAINE_LIVREUR=$NEXT_PUBLIC_DOMAINE_LIVREUR \
    NEXT_PUBLIC_DOMAINE_VITRINE=$NEXT_PUBLIC_DOMAINE_VITRINE \
    NEXT_PUBLIC_DOMAINE_DRIVE=$NEXT_PUBLIC_DOMAINE_DRIVE \
    NEXT_PUBLIC_DOMAINE_CHAUFFEUR=$NEXT_PUBLIC_DOMAINE_CHAUFFEUR \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build
# Les dépendances de développement ne servent plus une fois le site construit.
RUN npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
# Le commit construit : exposé par /api/health, pour savoir quel correctif tourne.
ARG GIT_SHA=inconnue
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    GIT_SHA=$GIT_SHA
# Tout le dossier et non le seul .next : `next start` relit next.config.js,
# qui exige la configuration next-intl (i18n/) et les traductions (messages/).
# Propriété de « node » : Next écrit son cache d'images dans .next/cache.
COPY --from=builder --chown=node:node /app ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
