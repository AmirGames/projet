# Webhooks sortants ZupDrive — contrat et reprise (A11)

## État et périmètre

Le transport et la file PostgreSQL sont développés. `ZUPDRIVE_WEBHOOKS_ENABLED`
vaut `false` par défaut. Aucun service métier ZupDrive n'émet encore ces
événements : le déclenchement existant est manuel et réservé au superowner.
Ne pas activer ni présenter l'intégration comme disponible avant d'avoir relié
chaque événement à la transition métier dans la même transaction, puis validé
les tests d'intégration et l'exploitation. Les providers email/SMS ne sont pas
concernés.

## Contrat livré

Le déclenchement écrit `WebhookEvent` et les lignes `WebhookDeliveryDrive`
correspondantes dans une transaction Prisma. L'unicité endpoint/événement
empêche les doubles intentions identiques. La livraison est au moins une fois :
si le destinataire a traité le POST mais que le serveur s'arrête avant d'écrire
`SENT`, le même `X-Webhook-Id` est renvoyé à la reprise. Le destinataire doit
dédupliquer durablement sur cet identifiant avant d'appliquer son effet.

Ces modèles sont globaux à la plateforme et leur gestion est réservée au
superowner ; ils ne constituent pas une API par organisation. Aucun cloisonnement
multi-organisation n'est revendiqué pour cette intégration. Les corps d'événement
sont destinés au serveur inscrit, jamais au navigateur ou aux logs. Une rotation
de clé affecte les tentatives suivantes et la nouvelle clé ne sort qu'à la
réponse de rotation TLS.

Le corps JSON signé comprend `id`, `event`, `version` (`2026-10-11`), `sentAt`,
`attempt` et `data` (`resourceType`, `resourceId` et données métier). En-têtes :
`X-Webhook-Event`, `X-Webhook-Version`, `X-Webhook-Id`, `X-Webhook-Attempt` et
`X-Webhook-Signature: sha256=<hex HMAC-SHA256 du corps UTF-8 exact>`. Toute
réponse 2xx réussit ; 408, 429, 5xx et erreurs réseau/DNS sont retentés ; les
autres codes HTTP et destinations interdites sont définitifs. Le timeout du
transport existant est de 5 secondes. Les essais sont bornés par la politique
de l'endpoint (1 à 10 reprises, six par défaut), avec délai exponentiel et
plafond d'une heure.

Le résolveur DNS est réexécuté à chaque tentative ; les adresses privées, les
protocoles non HTTPS et les redirections ne sont jamais suivis. L'adresse
publique validée est épinglée pour la connexion. Le secret AES-GCM est déchiffré
uniquement en mémoire au moment de signer. Les corps de réponse distante ne
sont pas enregistrés ; les erreurs persistées sont bornées et expurgées.

## API et exploitation

Ces routes restent réservées au superowner via `adminAuth` :

- `POST /api/zupdrive/webhooks/admin/events` crée un événement et ses intentions ;
- `GET /api/zupdrive/webhooks/admin/deliveries?webhookId=&status=&limit=&offset=` inspecte les livraisons ;
- `POST /api/zupdrive/webhooks/admin/deliveries/:deliveryId/retry` reprend une livraison `FAILED` vers un endpoint actif, renvoie 202, et journalise l'action ;
- `POST /api/zupdrive/webhooks/admin/endpoints/:endpointId/rotate-secret` remplace la clé, renvoie le nouveau secret une seule fois et ne le journalise jamais ;
- `GET /api/zupdrive/webhooks/admin/stats` expose les compteurs existants.

La reprise conserve l'identifiant de dédoublonnage, remet le compteur à zéro et
est réservée au superowner. `SENT` signifie qu'une réponse HTTP 2xx réelle a été
reçue. La migration additive
`20261011100000_durable_zupdrive_webhooks` ajoute le bail, l'échéance, la borne
d'essais, les index, l'unicité et la relation vers l'événement. Appliquer avec
`cd backend && npx prisma migrate deploy && npx prisma generate`.

Le worker s'exécute dans le processus backend toutes les 10 secondes sous la
surveillance existante. Les réclamations conditionnelles PostgreSQL protègent
deux workers ; un bail de 60 secondes autorise la reprise après crash. Les
échecs terminaux restent inspectables. Une fois les événements métier
transactionnels intégrés et la validation d'exploitation terminée, l'opérateur
peut configurer `ZUPDRIVE_WEBHOOKS_ENABLED=true` puis redémarrer l'API. Cette
étape n'est pas autorisée par le code par défaut.

## Vérifications

Contrôles exécutés localement sur Windows avec Node 24.21.0, npm 12.0.2,
Prisma/client 7.10.0 :

```bash
cd backend
npx jest src/modules/zupdrive/__tests__/zupdrive-webhook-delivery.test.ts --runInBand
npx jest src/modules/webhooks/webhook-destination.test.ts --runInBand
npx prisma validate
npx tsc --noEmit
npm run lint
npm run build
```

Résultats : 3 suites, 63 tests réussis (livraison A11, routes existantes et
transport SSRF partagé) ; Prisma validate, TypeScript, lint et build backend
réussis. Les tests couvrent IP privées, DNS public puis privé, redirection non
suivie, signature, refus de destination, classification HTTP, timeout, flag
fermé, bail après crash, ID stable et deux workers concurrents. L'intégration
PostgreSQL et un serveur récepteur contrôlé restent requis avant activation.

## Registre de preuve

| Étape | Date (Europe/Brussels) | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 11 octobre 2026 | branche `claude/awesome-ride-m9lci8-a11-drive-webhooks`, SHA `633f3afd52b38b76d595213a0fa434c8abd84c02` | Code, migration et tests ciblés ci-dessus |
| Testé localement | 11 octobre 2026 | SHA `633f3afd52b38b76d595213a0fa434c8abd84c02`, Windows, Node 24.21.0, npm 12.0.2, Prisma/client 7.10.0 | 63/63 tests ciblés ; Prisma validate, TypeScript, lint et build réussis |
| CI GitHub | 11 octobre 2026, run courant en attente | [#38176898421](https://github.com/AmirGames/projet/actions/runs/38176898421), head `6c256ebeb9e7f995beb82d3d67fa5aa0fd96df0a` | Le run précédent #38176640071 a été annulé après la mise à jour documentaire ; aucune validation CI finale revendiquée |
| Intégré | Non intégré | PR #215 ouverte | [PR A11](https://github.com/AmirGames/projet/pull/215) |
| Déployé | Non déployé | VPS non modifié | Aucune |
| Validé en exploitation | Non validé ; flag désactivé | Aucun environnement de recette externe disponible | Aucune |
