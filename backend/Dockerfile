FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g npm@12.1.0
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
# su-exec : l'entrée du conteneur rend les volumes à « node » puis abandonne root.
RUN apk add --no-cache su-exec && npm install -g npm@12.1.0
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# Prisma 7 ne génère plus le client à l'installation : on reprend celui du build.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# De quoi appliquer les migrations (service « migrate » du compose).
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Photos, documents et sauvegardes : montés en volumes pour survivre aux
# reconstructions de l'image.
RUN mkdir -p uploads backups private-documents logs \
 && chown -R node:node uploads backups private-documents logs \
 && chmod 700 private-documents backups logs
# Le commit construit : exposé par /health, pour savoir quel correctif tourne.
ARG GIT_SHA=inconnue
ENV NODE_ENV=production \
    GIT_SHA=$GIT_SHA
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health >/dev/null || exit 1
# Les migrations ne sont plus lancées ici : le service « migrate » du compose
# les applique une fois, avant les instances de l'API (plusieurs instances
# lançaient des migrations concurrentes, avec le même rôle SQL que l'exécution).
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
