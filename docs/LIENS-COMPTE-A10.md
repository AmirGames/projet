# A10 — liens de compte à usage unique

Le reset et la confirmation conservent uniquement une empreinte SHA-256 du
jeton. La lecture initiale sert à trouver le compte ; la mutation décisive
revérifie dans PostgreSQL l'identifiant, l'adresse, l'état actif, l'empreinte
encore présente et une expiration strictement future. Une seule ligne doit
être modifiée. Un lien réémis ou consommé perd donc la course.

`POST /api/auth/reset-password` (public, corps `{jeton,password}`) répond
`200` après modification du mot de passe, révocation des sessions, suppression
des liens en attente et rattachement éventuel de la fiche invitée. Ces écritures
forment une transaction ; une panne annule toutes les modifications. Le code
`400 INVALID_RESET_TOKEN` signifie lien expiré, déjà utilisé ou remplacé,
sans révéler le compte visé.

`POST /api/auth/verify-email` (public, corps `{jeton}`) répond `200` avec
`{message,email}` après confirmation. Confirmation et rattachement éventuel
de la fiche invitée sont atomiques. Le rattachement vérifie encore l'adresse,
la fiche non supprimée et l'absence de propriétaire ; une reprise après
rollback est possible. `400 INVALID_EMAIL_TOKEN` couvre le lien inconnu,
utilisé ou remplacé ; `400 EXPIRED_EMAIL_TOKEN` couvre un lien déjà expiré
à la lecture. Si l'expiration survient pendant la consommation, le refus est
`INVALID_EMAIL_TOKEN`. Les demandes publiques de lien gardent leur réponse
générique. Les limitations de débit existantes restent en place.

Configuration existante : `DATABASE_URL` PostgreSQL, `SITE_URL` ou
`FRONTEND_URL`, `REQUIRE_EMAIL_VERIFICATION` et
`ENABLE_EMAIL_VERIFICATION`. Aucune migration, variable nouvelle ni changement
de schéma. L'outbox de confirmation ne stocke que `userId` ; la réémission
invalide l'ancien lien. Les envois SMTP échoués se reprennent par l'outbox.

Validation locale : depuis `backend/`, `npx tsc --noEmit`, `npm run lint`,
`npm run build`, et `npx jest src/modules/auth/__tests__/auth-routes-caracterisation.test.ts src/modules/auth/__tests__/confirmation-outbox.test.ts --runInBand`.
Les courses déterministes PostgreSQL : préparer une base isolée migrée dont
le nom contient `test`, définir `DATABASE_URL`, puis
`npx jest src/modules/auth/__tests__/account-links.pg.test.ts --runInBand`.
Vérifier les erreurs 400, l'unique gagnant, les sessions révoquées, l'absence
de fiche rattachée après rollback et la reprise. Après déploiement, confirmer
SMTP/outbox, les URL publiques et les journaux sans jeton. Déploiement et
validation en exploitation sont à consigner séparément des tests locaux.
