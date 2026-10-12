# Matrice des dépendances et reprise

Mise à jour A14 — 12 octobre 2026. Cette matrice décrit les capacités serveur ;
elle ne constitue pas une validation de réception client.

| Dépendance | Fonction | Criticité | Santé / comportement en panne | Reprise |
|---|---|---|---|---|
| PostgreSQL | Sessions, autorisations, commandes, paiements et état durable | Bloquante pour le trafic général | `/health` reste 200 (processus vivant), `/health/ready` retourne 503 après une requête `SELECT 1` bornée à 3 s | Rétablir PostgreSQL, vérifier migrations et journaux, confirmer readiness 200 |
| Redis | Quotas partagés des routes protégées et diffusion temps réel multi-instance | Bloquante en production pour la readiness ; temps réel dégradé en mono-instance | Routes dont le limiteur dépend de Redis refusent sûr; readiness 503 si Redis configuré mais non prêt. En dev, repli mémoire autorisé. | Rétablir Redis, contrôler les connexions des quotas et de Socket.IO, puis readiness et événements entre instances |
| ClamAV | Analyse des documents déposés | Bloquante uniquement pour dépôt/acceptation de document | Dépôt refusé en erreur fermée; readiness générale inchangée; vigie mesure `clamav` par `PING` borné à 1,5 s, cache 30 s | Contrôler clamd et signatures, `clamdscan --ping 1`, confirmer réponse PONG puis effectuer un dépôt de test non sensible |
| SMTP | Courriels transactionnels et alertes | Dégradée, non bloquante pour le trafic HTTP | SMTP vérifié par la vigie toutes les 5 min, sans affecter `/health/ready`; l'alerte SMTP ne s'envoie pas elle-même par SMTP | Rétablir le relais, vérifier la file Outbox et envoyer un message de contrôle |
| Stripe | Intentions et confirmation des paiements via webhooks | Critique pour les paiements, non bloquante pour le trafic général | Configuration/secret de webhook contrôlés; aucune sonde payante ni appel distant par requête de santé | Contrôler les secrets et l'état des webhooks dans Stripe, utiliser exclusivement un parcours TEST avant réactivation |
| Services externes (cartographie, OSRM, push, SMS, stockage média, assistant) | Capacités métier distinctes et configurables | Dégradée selon la fonction et son activation | Pas de dépendance à la readiness générale; vigie présente les configurations/canaux déjà observés. Pas d'appel payant dans les sondes | Tester l'intégration concernée avec son fournisseur et ses identifiants de test |

## Contrats des sondes

- `GET /health` est une sonde de vie du processus, sans dépendance externe. Elle
  répond 200 tant que l'API traite les requêtes. Docker l'utilise comme
  healthcheck; une panne optionnelle ne provoque donc pas de boucle de restart.
- `GET /health/ready` renvoie 200 si PostgreSQL répond et si Redis, obligatoire
  en production, est prêt; sinon 503. Le JSON expose `status`, `revision`,
  `pret`, des états fonctionnels génériques et l'uptime. Il ne révèle ni hôte,
  erreur réseau, secret ni URL de fournisseur. SMTP et ClamAV n'en retirent pas
  la disponibilité générale.
- Le dépôt demeure fermé si ClamAV est absent/injoignable. Un état fonctionnel
  `depotDocuments: indisponible` est disponible dans la readiness publique; le
  diagnostic détaillé reste dans la surveillance superowner.
- Les durées maximales sont 3 s pour PostgreSQL, 1,5 s pour ClamAV et 5 s pour
  SMTP. ClamAV est mis en cache 30 s, SMTP 5 min. Redis est lu via l'état du
  client de quotas, sans commande supplémentaire ni coût fournisseur.

## Alertes et limites de preuve

La vigie relève toutes les 30 s et ouvre une alerte de dépendance après le
premier relevé en panne; elle relance au plus toutes les 15 min et ferme après
deux relevés sains. Le transport e-mail est essayé par Nodemailer et les
webhooks sont tentés de façon asynchrone. Un incident construit/journalisé,
une remise au transport (messageId/réponse HTTP) et une réception visible par
un opérateur sont trois preuves distinctes. Ni `SMTP verify`, ni un HTTP 2xx du
webhook ne prouvent que la personne a lu/reçu l'alerte. Pour l'exploitation,
consigner séparément l'incident, la remise du transport et la réception
confirmée, avec horodatage et destinataire expurgé.

Seuil initial : PostgreSQL et Redis indisponibles = alerte critique; ClamAV,
SMTP et fonctions externes = alerte de dégradation. Les seuils de durée de
réponse et de charge restent définis dans `vigie.service.ts`; ajuster après
observation de la charge réelle. Pour simuler une panne, utiliser un réseau
Compose de test jetable, ne jamais couper les services partagés d'un poste.

```bash
cd backend
npx jest src/modules/monitoring/__tests__/sondes.test.ts --runInBand
npx jest src/modules/files/__tests__/antivirus.test.ts --runInBand
```

Les tests de sonde locale simulent ClamAV uniquement. Les coupures PostgreSQL,
Redis et SMTP, la reprise de l'ensemble Docker, les notifications livrées et
leur réception restent à éprouver dans un environnement isolé avec les
services et comptes dédiés. Aucun essai production n'est couvert ici.
