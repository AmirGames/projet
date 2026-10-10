# ZupDrive Driver

Application Expo du chauffeur ZupDrive (transport de personnes). Ce rôle est distinct du livreur ZupEat de `mobile/apps/delivery`.

## Session et rotation A09

La session est conservée dans SecureStore. Les appels 401 partagent une rotation en mémoire, qui envoie un `requestId` aléatoire cryptographique au `POST /api/auth/refresh`. Après une réponse perdue, l'app réessaie une fois avec le même refresh et la même clé, dans la fenêtre de reprise serveur de 10 secondes. Les erreurs réseau et les 409 persistants ne déconnectent pas ; un refus 401/403 définitif termine la session. Le nouveau couple est enregistré dans SecureStore avant d'être rendu. Voir le [contrat A09](../../../docs/ROTATION-SESSIONS-A09.md).

Test ciblé : `npm test -- --runInBand lib/__tests__/renouvellement.test.ts`.

## Développement

```bash
npm ci
npm start
npm run typecheck
npm run lint
npm test
```

`EXPO_PUBLIC_API_URL` permet de choisir l'API ; sinon l'app utilise le serveur de développement associé à Metro. Les builds natives passent par Expo/EAS ; Expo Go ne remplace pas un build de développement pour les modules natifs.

Architecture des écrans et routes métier : [CLAUDE.md](./CLAUDE.md). Règles Expo : [AGENTS.md](./AGENTS.md).