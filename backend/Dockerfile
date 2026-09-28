FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline --no-audit
COPY --from=builder /app/dist ./dist
# Prisma 7 ne génère plus le client à l'installation : on reprend celui du build.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# De quoi appliquer les migrations au démarrage.
COPY prisma ./prisma
COPY prisma.config.ts ./
# Photos, documents et sauvegardes : montés en volumes pour survivre aux
# reconstructions de l'image.
RUN mkdir -p uploads backups
ENV NODE_ENV=production
EXPOSE 3001
# Les migrations passent avant l'API : une migration en échec arrête le
# conteneur au lieu de servir un code en avance sur la base.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/server.js"]
