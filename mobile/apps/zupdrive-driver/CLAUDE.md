# Application chauffeur ZupDrive — règles de travail

Application Expo/React Native du chauffeur VTC, distincte du livreur ZupEat. L’app est actuellement hors périmètre du pilote tant que le parcours réel décrit dans [`docs/validation-mobile-zupdrive-driver.md`](../../../docs/validation-mobile-zupdrive-driver.md) n’est pas exécuté et prouvé.

## Contrats en vigueur

- Authentification commune ZupOne : `POST /api/auth/login` (`email`, `password`) et rotation commune `/api/auth/refresh`. Pas d’OTP chauffeur séparé.
- Dossier : `GET /api/zupdrive/chauffeur/me` ; les courses chauffeur sont `GET /api/zupdrive/chauffeur/me/courses`.
- Disponibilité/position : `POST /api/zupdrive/chauffeur/me/disponibilite` (`enLigne`) et `/me/position` (`latitude`, `longitude`).
- Proposition : `POST /api/zupdrive/chauffeur/me/propositions/:id/accepter|refuser`, où `id` est l’identifiant de proposition.
- Étapes : `POST /api/zupdrive/chauffeur/me/courses/:id/arrive|demarrer|terminer`.
- Revenus : `GET /api/zupdrive/payment/earnings`.

Les routeurs actuels sont `backend/src/modules/zupdrive/chauffeur.routes.ts`, `course-drive.routes.ts` et `zupdrive-montage.ts`. Ces fichiers font foi si les contrats évoluent. Tester les chemins HTTP exacts, les rôles et le cloisonnement ; une compilation TypeScript seule ne suffit pas.

## Sécurité et état

Toujours dériver le chauffeur de la session commune ; ne jamais demander les courses passager depuis l’application chauffeur. Le backend est la frontière d’autorisation. Ne rendre disponibles les contrôles de conduite qu’avec un dossier `VALIDE`. Traiter un 409 d’acceptation comme une concurrence métier : relire le tableau et afficher l’état réel. Une proposition expirée est refusée par le backend. Les pannes réseau ne doivent pas effacer la session ni fabriquer un succès ; un 401 définitif de renouvellement ramène à la connexion.

## Expo

Lire `AGENTS.md` avant tout changement Expo. Expo est en SDK 57 (`package.json` : `~57.0.25`) ; consulter les [docs versionnées SDK 57](https://docs.expo.dev/versions/v57.0.0/) avant d’utiliser ou modifier une API Expo. Installer avec `npm ci`, contrôler `npm run typecheck`, `npm run lint` et les tests Jest de contrats d’URL.
