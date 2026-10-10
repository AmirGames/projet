# ZupDrive — application passager

Le renouvellement mobile est partagé, transmet un `requestId` lié à une seule opération et reprend une réponse perdue pendant au plus 10 secondes. Voir le [contrat A09](../../../docs/ROTATION-SESSIONS-A09.md).

Application mobile du **passager** ZupDrive (VTC) : il commande un trajet à prix fixe, le suit, l'annule, le paie par carte et note son chauffeur. Ce n'est pas l'app livreur de ZupEat (`../delivery`) ni l'app client ZupEat (`../customer`).

Règles, écrans et routes : voir [`CLAUDE.md`](./CLAUDE.md) et [`docs/zupdrive.md`](../../../docs/zupdrive.md).

## Lancer

```bash
npm install
npx expo start      # téléphone ou émulateur
npm run web         # navigateur (sans formulaire de carte)
npm test            # fonctions pures de lib/
npm run typecheck && npm run lint
```

L'adresse du serveur se déduit de `EXPO_PUBLIC_API_URL`, sinon du PC qui sert Metro (port 3001) : voir `lib/api.ts`. Le paiement par carte (Stripe, clé publique lue sur `/api/payments/config`) demande une **build de développement** (`npx expo run:android`) : Expo Go ne le porte pas.

## Organisation

```
app/_layout.tsx            session (AuthProvider) et routes protégées
app/connexion.tsx          connexion
app/(onglets)/             Commander, Mes trajets, Profil
app/trajet/[id].tsx        suivi, annulation, paiement, note
components/                ChampAdresse, PaiementCarte (+ .web), LiveMap, ui
lib/courses.ts             API des trajets (devis, commande, suivi, annulation, note, paiement)
lib/{auth,api,session}     session, appels au serveur (renouvellement géré), SecureStore
lib/{paiement,statuts,adresses,confirmer}.ts   logique pure ou petite aide
lib/push.ts                notifications push (non branché, voir CLAUDE.md)
```
