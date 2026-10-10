# Site ZupEat / ZupOne / ZupDrive

## Liens de compte A10

Les pages `/reinitialiser` et `/verifier-email` affichent les erreurs métier
de l'API lorsqu'un lien est expiré, réémis ou déjà utilisé. Le backend décide
seul de la consommation et du rattachement des données invitées ; aucun état
local du navigateur ne fait foi. Contrat des routes, configuration, tests et
exploitation : [guide A10](../docs/LIENS-COMPTE-A10.md). Aucune variable ni
migration frontend nouvelle.

## MFA administration (A05)

Le contexte de compte affiche `MfaGate` avant les pages privilégiées.
`/mfa` est disponible sur chaque domaine : inscription manuelle TOTP, codes de
récupération affichés une fois, rotation et révocation. Le relais existant
`/api/auth/*` transmet les opérations POST au backend sous bearer ; aucun
secret n'entre dans une URL ou le stockage navigateur. Un refus MFA récente
interrompt la page ; confirmer puis relire/recommencer l'action explicitement.
Le serveur reste la frontière de sécurité et relit la preuve de la session SSO.
Tests `components/__tests__/MfaGate.test.tsx`, runner réel
`node scripts/verif-mfa.mjs` avec base dédiée et export admin Expo ;
[guide](../docs/MFA.md), [preuves et limites](../docs/preuves-a05-2026-10-10.md).

Application Next.js 16, React 19. Lire [AGENTS.md](AGENTS.md) et
[l'architecture](ARCHITECTURE.md) avant modification.

## Versements A04

Les écrans `/superowner/zupeat/payouts` et `/superowner/zupeat/versements`
affichent les états serveur. Un relevé rattaché à un lot n'offre plus de paiement
ou d'annulation individuels ; un conflit 409 provoque une relecture et garde
le message métier. Le formulaire obsolète est fermé.

API, configuration backend, diagnostic et rapprochement :
[guide A04](../docs/VERSEMENTS-CONCURRENCE.md). Aucune variable frontend nouvelle,
permission ou règle financière ajoutée au client. Les textes restent fr/en.

```bash
npm ci
npx tsc --noEmit
npm run lint
npx jest --runInBand
npm run build
```

Les tests `app/superowner/zupeat/payouts/__tests__/conflit.test.jsx` contrôlent
le masquage des actions et la relecture après 409. Les
[preuves datées](../docs/preuves-a04-2026-10-09.md) distinguent composants, builds,
CI et exploitation ; les tests de composants ne prouvent pas un parcours navigateur.
