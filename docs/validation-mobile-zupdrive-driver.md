# Guide de validation — application chauffeur ZupDrive (A06)

État au 11 octobre 2026 : typecheck, lint, export Expo web, 49 tests mobiles et 4 assertions statiques de montage/authentification des routes backend passent localement. L’intégration backend PostgreSQL a été tentée, mais les identifiants de la base configurée dans `.env.test` ont été refusés (25 tests échoués avant leurs assertions). Le parcours appareil connecté et les vérifications API avec droits réels restent à exécuter ; l’application est **hors périmètre du pilote** jusque-là.

## Préparation du backend de test

Utiliser un environnement explicitement dédié aux tests, avec PostgreSQL, Redis si requis par la configuration, et les migrations du dépôt. Ne jamais utiliser un compte ou une base de production.

```powershell
cd backend
npm ci
npx prisma migrate deploy
npx jest src/modules/zupdrive/__tests__/course-drive.integration.test.ts --runInBand
npx jest src/modules/zupdrive/__tests__/zupdrive-montage.test.ts --runInBand
```

Renseigner `.env` local uniquement avec les accès du backend de test, démarrer `npm run dev`, puis configurer l’app avec `EXPO_PUBLIC_API_URL=http://<hôte-joignable>:3001`. Vérifier que le téléphone et le serveur partagent un réseau accessible. Pour un appareil physique, `localhost` pointe vers le téléphone lui-même.

## Scénarios obligatoires sur API et appareil/émulateur

1. Se connecter avec `POST /api/auth/login` (compte chauffeur commun) et vérifier le jeton Bearer, la persistance SecureStore (`zupdrive.driver.session`) et le rechargement de session.
2. Vérifier un compte sans dossier, puis un dossier `BROUILLON`/`SOUMIS`/`REFUSE`/`SUSPENDU` : l’app explique le statut et ne permet pas de se mettre en ligne. Vérifier `VALIDE` : disponibilité possible.
3. Autoriser la localisation et transmettre une position par `POST /api/zupdrive/chauffeur/me/position`; vérifier qu’une position récente rend le chauffeur éligible au matching. Tant que l’app reste au premier plan, vérifier une mise à jour au moins toutes les 15 secondes. Une position ancienne ne doit pas recevoir de proposition.
4. Commander un trajet depuis le compte passager test et vérifier qu’une proposition apparaît dans le tableau chauffeur sous 20 secondes. Vérifier l’échéance, son expiration, le refus et le passage à une autre proposition.
5. Faire viser simultanément la même proposition par deux chauffeurs de test. Un seul doit obtenir la course ; l’autre reçoit un 409 (`OFFER_CLOSED` ou `RIDE_UNAVAILABLE`) et son tableau rechargé ne doit pas déclarer la course acceptée.
6. Pour la proposition gagnante, exécuter `arrive`, `demarrer`, `terminer` dans l’ordre. Relire chaque état depuis l’API et vérifier l’historique chauffeur et le revenu/versement retourné.
7. Avec un jeton passager, tenter `GET /api/zupdrive/chauffeur/me/courses` ; sans jeton, tenter les routes chauffeur ; avec un chauffeur, tenter de lire une course appartenant à l’autre chauffeur. Vérifier refus d’authentification/autorisation et 404 cloisonné. Confirmer qu’aucune donnée passager n’est accessible hors participant autorisé.
8. Couper le réseau pendant une lecture, une rotation de session et une acceptation ; vérifier qu’aucun succès n’est affiché à tort, que la session n’est pas détruite sur une panne transitoire et que l’état serveur est relu au retour du réseau.

## Contrôles code

Depuis `mobile/apps/zupdrive-driver` :

```powershell
npm ci
npm run typecheck
npm run lint
npm test -- --runInBand lib/__tests__/chauffeur.test.ts
npm test -- --runInBand lib/__tests__/api.test.ts lib/__tests__/renouvellement.test.ts
```

Le test `chauffeur.test.ts` caractérise les URLs employées pour dossier, courses, disponibilité, position, acceptation, étapes et revenus. Il ne remplace pas les scénarios HTTP/PostgreSQL ni l’essai de l’application native.

## Preuves à consigner

Pour chaque résultat, indiquer la date, le SHA testé, la version Android/iOS et Expo, le type d’appareil/émulateur, l’environnement/backend, le SHA des migrations, la commande ou le scénario, le résultat et un lien vers le run ou la preuve. Consigner séparément : développé, testé localement, testé en CI, intégré, déployé, validé en exploitation. Une case de demande ou un build ne prouve pas une course réelle. Ne pas inclure de secret, jeton, donnée personnelle ou identifiant réel dans la preuve.

## Vérification de portée — 13 octobre 2026

Valider le conducteur ZupDrive sur appareil réel et selon les obligations réglementaires locales ; hors pilote ZupEat.

Voir [état du projet](etat-projet.md) et [recette A16](RECETTE-PILOTE-A16-2026-10-12.md). Cette revue n'atteste aucun test externe.
