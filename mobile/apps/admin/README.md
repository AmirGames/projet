# ZupOne Admin (mobile)

Le renouvellement utilise une seule requête partagée, un `requestId` par opération et la reprise bornée serveur après réponse perdue. Les coupures et conflits temporaires ne déconnectent pas; le refus définitif invalide la session. Voir [contrat A09](../../../docs/ROTATION-SESSIONS-A09.md).

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
