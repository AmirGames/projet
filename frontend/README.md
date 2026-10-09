# Site ZupEat / ZupOne / ZupDrive

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
