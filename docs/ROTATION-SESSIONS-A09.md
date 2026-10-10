# Rotation des sessions — A09

## Contrat

`POST /api/auth/refresh` conserve son transport : le navigateur utilise le
cookie HttpOnly `zup_refresh` et le mobile envoie `refreshToken` dans le corps.
Chaque demande porte une clé aléatoire cryptographique de 16 à 128 caractères : `requestId`
dans le corps mobile ou `X-Refresh-Request` dans l'en-tête web. Une nouvelle clé est
créée pour chaque rotation; un retry réseau de la même demande réutilise la
même clé. Les intégrateurs doivent la produire avec un CSPRNG (32 octets en
hexadécimal); une clé prévisible affaiblit cette preuve.

La consommation conditionnelle du refresh parent, l'enregistrement de sa
preuve de reprise et la création du successeur sont faites sous verrou de ligne
PostgreSQL dans une transaction. La durée du successeur reste bornée par
l'échéance absolue de la session (7 jours). Une réponse perdue peut être reprise
pendant **10 secondes**, seulement avec la même clé et le même refresh parent;
le serveur resigne alors le même
successeur à partir de son `jti`. En base, il ne conserve que le hash de la clé
et le `jti` aléatoire, jamais le JWT refresh.

Une autre clé, un refresh parent présenté hors fenêtre ou un successeur absent
ferme la session et retourne `401 SESSION_INVALIDE`. `409 REFRESH_CONCURRENT`
signale seulement un conflit transactionnel temporaire; le client attend au
plus une fois puis réessaie avec la même clé. `400 REFRESH_CLE_REQUISE` signale
un client non mis à jour; aucune rotation n'a lieu. `403 CSRF_ORIGINE` garde
son sens pour l'origine d'un cookie. La révocation centrale reste attachée à
`SessionConnexion`.

## Stockage et migration

Migration additive `20261010120000_atomic_refresh_rotation` : `repriseHash`,
`successeurJti`, `repriseExpiresAt` et un index de nettoyage. Appliquer par le
flux habituel `prisma migrate deploy`; aucune valeur existante n'est backfillée.
Les sessions ouvertes restent utilisables après migration. Les vieux clients
qui ne transmettent pas `requestId` doivent être mis à jour avant d'exiger cette
version du serveur; ils reçoivent `400 REFRESH_CLE_REQUISE` sans consommer le
refresh.

## Clients

Le web utilise Web Locks quand disponibles, un `requestId` par opération et
deux essais maximum. Il ne déconnecte que sur `401/403` définitif; panne réseau
et `409` persistant gardent la session locale. Chaque application Expo partage
le renouvellement en mémoire, persiste le nouveau couple avant de le retourner,
attend une fois sur `409`, et ne ferme pas la session pour les erreurs
transitoires. Le SecureStore existant reste le seul stockage mobile des jetons.

## Exploitation et limites

Déploiement : vérifier la sauvegarde PostgreSQL, appliquer la migration avant
le serveur, puis surveiller `REFRESH_CONCURRENT`, `REFRESH_CLE_REQUISE` et
`SESSION_INVALIDE` sans journaliser jeton ni clé. La fenêtre de 10 secondes
réduit la récupération d'un refresh volé uniquement si l'attaquant ne possède
pas la clé indépendante de la demande; une clé volée avec le refresh autorise
la reprise pendant cette fenêtre. PostgreSQL sérialise une session même si deux
refresh parents différents sont présentés.

Commandes ciblées :

```text
cd backend && npx prisma generate
cd backend && npx jest src/modules/auth/__tests__/session-rotation.test.ts --runInBand
cd backend && npx jest src/modules/auth/__tests__/rotation-refresh.pg.test.ts --runInBand
cd mobile/apps/delivery && npm run test:session
cd frontend && npx jest lib/__tests__/jeton-session.test.ts --runInBand
```

Les courses PostgreSQL exigent `DATABASE_URL` vers une base de test dédiée
dont le nom contient `test`; ne jamais exécuter sur une base de production.
Les preuves de ce changement sont inscrites dans
[`etat-projet.md`](etat-projet.md#étape-06--a09-rotation-atomique-des-sessions).
