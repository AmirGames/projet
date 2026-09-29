# ZupOne Admin (mobile)

Application Expo de l'équipe d'administration : superowner et membres de l'équipe (SuperAdmin, Administrateur, Support, groupes personnalisés).

- Connexion par `/api/auth/login` ; seuls les comptes `isSuperOwner` ou `isSystemAdmin` sont acceptés.
- Les onglets affichés dépendent de `GET /api/superowner/me/permissions?plateforme=EAT`. **Ce n'est qu'un confort** : chaque route `/api/superowner/*` vérifie elle-même le rôle, les permissions (lecture/modification) et journalise les actions (`journaliser` / `systemAuditLog`).
- Écrans : tableau de bord, commerces (valider, suspendre, réactiver), livreurs (valider, refuser, suspendre, réactiver), tickets de support (fil, réponse, statut), compte.
- Aucune route backend nouvelle : l'app réutilise celles de l'espace web superowner.

```bash
npm install
npm start      # EXPO_PUBLIC_API_URL pour viser un autre serveur
npm run lint && npx tsc --noEmit
```
