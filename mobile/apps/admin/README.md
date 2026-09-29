# ZupOne Admin (mobile)

Application Expo de l'équipe d'administration : superowner et membres de l'équipe (SuperAdmin, Administrateur, Support, groupes personnalisés).

- Connexion par `/api/auth/login` ; seuls les comptes `isSuperOwner` ou `isSystemAdmin` sont acceptés.
- Les onglets affichés dépendent de `GET /api/superowner/me/permissions?plateforme=EAT`. **Ce n'est qu'un confort** : chaque route `/api/superowner/*` vérifie elle-même le rôle, les permissions (lecture/modification) et journalise les actions (`journaliser` / `systemAuditLog`).
- Écrans : tableau de bord, commerces (valider, suspendre, réactiver), livreurs (valider, refuser, suspendre, réactiver), versements (lot SEPA en attente, arrêt de la semaine, relevés commerçants et livreurs), tickets de support (fil, réponse, statut), équipe (superowner seulement : ajouter un compte existant, rôle par plateforme, retrait), compte.
- Restent sur l'espace web : téléchargement du fichier SEPA, « marquer le lot versé », réglage des permissions de chaque groupe.
- Aucune route backend nouvelle : l'app réutilise celles de l'espace web superowner.

```bash
npm install
npm start      # EXPO_PUBLIC_API_URL pour viser un autre serveur
npm run lint && npx tsc --noEmit
```
