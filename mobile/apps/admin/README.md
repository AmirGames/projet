# ZupOne Admin (mobile)

## Dépendances — audit A12

Le lockfile du 12 octobre 2026 conserve 32 avis de production (`npm audit
--omit=dev`: 21 hautes, 11 modérées). Ils sont dans l’arbre Expo distribué;
leur exploitabilité n’est pas établie par le seul audit. Revue des paquets,
limites et échéance du 12 novembre 2026 : [audit A12](../../../docs/AUDIT-DEPENDANCES.md).

Le renouvellement utilise une seule requête partagée et un `requestId` aléatoire cryptographique par opération. Après une réponse perdue, il réessaie une fois avec la même clé dans la fenêtre serveur de 10 secondes. Une panne réseau ou un 409 persistant ne déconnecte pas ; seul un refus 401/403 définitif termine la session. Voir [contrat A09](../../../docs/ROTATION-SESSIONS-A09.md).

Application Expo de l'équipe d'administration : superowner et membres de l'équipe (SuperAdmin, Administrateur, Support, groupes personnalisés).

- Connexion par `/api/auth/login` ; seuls les comptes `isSuperOwner` ou `isSystemAdmin` sont acceptés.
- Les onglets affichés dépendent de `GET /api/superowner/me/permissions?plateforme=EAT`. **Ce n'est qu'un confort** : chaque route `/api/superowner/*` vérifie elle-même le rôle, les permissions (lecture/modification) et journalise les actions (`journaliser` / `systemAuditLog`).
- Écrans : tableau de bord, commerces (valider, suspendre, réactiver), livreurs (valider, refuser, suspendre, réactiver), versements (lot SEPA en attente, arrêt de la semaine, relevés commerçants et livreurs), tickets de support (fil, réponse, statut), équipe (superowner seulement : ajouter un compte existant, rôle par plateforme, retrait), compte.
- Restent sur l'espace web : téléchargement du fichier SEPA, « marquer le lot versé », réglage des permissions de chaque groupe.
- L'app réutilise les routes de l'espace web superowner et le contrat MFA commun `/api/auth/mfa`.

## MFA administration — A05

Avant de charger les permissions ou les écrans privilégiés, l'app contrôle le
statut MFA de la session. `MfaScreen` propose inscription manuelle TOTP,
confirmation, récupération à usage unique et remplacement ; la gestion du
facteur se retrouve aussi dans « Compte ». Un refus MFA récente interrompt la
page ; confirmer puis recommencer explicitement l'action, sans rejeu automatique.
Clés et codes de récupération restent dans l'état mémoire de cet écran,
jamais dans SecureStore/AsyncStorage ou une URL. Les jetons de session suivent
le stockage existant. Le serveur exige la preuve sur toutes les routes, même
en appel direct depuis un autre client ou domaine.

`npx tsc --noEmit`, `npm run lint`, `npx expo export --platform web --output-dir
../../../.tmp/a05-admin-web` ; runner réel `frontend/scripts/verif-mfa.mjs`.
La compilation/validation Expo web ne valide pas un binaire Android/iOS.
[Guide API et récupération opérateur](../../../docs/MFA.md),
[preuves et limites](../../../docs/preuves-a05-2026-10-10.md).

```bash
npm install
npm start      # EXPO_PUBLIC_API_URL pour viser un autre serveur
npm run lint && npx tsc --noEmit
```

## Consigne de vérification — 13 octobre 2026

Tester l'app admin sur appareil, la MFA et les refus de permissions ; la CI ne vaut pas recette réelle.

Cette note ne constitue pas une validation de production.
