# Audit HTTP ciblé de production — 3 octobre 2026

**Suivi au 4 octobre 2026 :** le contrôle support/organisations après
déploiement est validé à **67/67** dans le périmètre ci-dessous. Les échecs
du passage initial sont conservés comme historique. Voir
[l'état courant et les prochaines validations](etat-projet.md).

## Confirmation après déploiement

L'opérateur a transmis le résultat du nouveau passage sur le VPS au commit
`c82513c7` : **67 assertions réussies, 0 échec**, rapport
`audit-idor-1791035627538-46f51e3e.json` sur le VPS. Les deux organisations,
les tickets et les comptes temporaires ont été supprimés ; les sessions
renvoient 401. Les quatre échecs ci-dessous décrivent le passage antérieur
au déploiement, et sont désormais résolus dans ce périmètre.

## Passage initial

Cible : https://api.zupeat.com. Exécution du 3 octobre 2026 à 13:25 UTC
sur le déploiement correspondant au commit `aece64aa` indiqué par l'opérateur.
Le commit actif n'est pas attesté par une réponse de l'API.

## Résultats

67 assertions : **63 réussies, 4 échouées**. Les quatre échecs concernent
la même faille sur `GET /api/organizations`, testée dans les deux sens.

- Support : lecture, liste, archives, création, changement de statut,
  suppression et lecture des messages refusés sans jeton (401) et entre les
  organisations Alice/Bob (403). Les opérations légitimes réussissent.
- Après les tentatives intrusives, chacun lit encore son ticket OPEN et
  une liste contenant un seul ticket. Le changement légitime IN_PROGRESS
  est ensuite relu avec succès. Vérification par API, pas par accès SQL.
- Organisation par identifiant : le voisin est refusé en 403, y compris
  avec la casse `Organizations` et le segment encodé `%6frganizations`.
  La lecture sans jeton est refusée en 401, celle du membre réussit.
- Un compte ordinaire est refusé en 403 sur `/api/admin/config`,
  `/api/superowner/dashboard` et `/api/zupdrive/admin/chauffeurs`.

## Faille présente sur le serveur lors du passage initial — corrigée ensuite

`GET /api/organizations` est sans authentification et sélectionne
`req.body.userId || "user-123"`. Un GET avec un corps JSON peut donc
sélectionner les organisations d'un autre utilisateur. Le service inclut
les boutiques et les identités des membres (identifiant, nom, e-mail).

Le test a utilisé uniquement les identifiants des comptes temporaires.
Dans les deux sens, la requête anonyme répond 200 et l'identité injectée
par le voisin n'est pas ignorée.

Correction locale : `authMiddleware` sur cette route, puis sélection
exclusive par `req.userId`. Aucun identifiant client ne choisit la liste.
**Lors du passage initial, cette correction n'était pas encore publiée ni
déployée.** La confirmation en tête de ce rapport consigne le passage
ultérieur à 67/67 après déploiement.

## Nettoyage et limites

Les deux tickets et les deux organisations ont été supprimés avec leur
compte propriétaire. Les lectures suivantes renvoient 404. Les deux comptes
ont ensuite été supprimés par l'API, qui confirme la suppression du compte
entier ; leurs sessions renvoient 401.

Aucun paiement, commande, boutique, rôle administrateur ou changement de
suspension n'a été créé. Aucune base n'a été réinitialisée. Les profils
clients anonymisés, consentements, journaux et éventuelles notifications
d'ouverture des tickets peuvent subsister conformément aux mécanismes de
l'application. Le test n'a pas supprimé ces traces avec des privilèges SQL.

Ce test ne remplace pas un pentest complet. Les courses, paiements,
notifications et comptes suspendus n'ont pas été testés ici avec des fixtures
authentifiées de production. Les contrôles antérieurs des comptes suspendus
étaient locaux. L'audit réseau/TLS et la restauration des sauvegardes ont été
réalisés séparément ; ils ne garantissent pas toute la sécurité du VPS.

## Validation locale et procédure de reprise — résultat obtenu : 67/67

- Régression HTTP Express avec authentification réelle et dépendances
  simulées : 4 tests réussis (anonyme, injections Alice/Bob, accès légitime).
- `npm run build` dans `backend` : génération Prisma, TypeScript et bundles OK.
- Le moteur Docker local est indisponible : pas de nouvelle exécution des
  suites utilisant une base dédiée durant ce passage.

Après publication Git du correctif puis `./deploy/zup.sh update`, depuis
la racine du dépôt sur le VPS :

```sh
node backend/scripts/security/audit-production-idor.mjs https://api.zupeat.com --run
```

Ce script autonome crée ses propres comptes et organisations, garde les
jetons et mots de passe en mémoire uniquement, puis nettoie ses fixtures.
Il écrit un rapport JSON sans secrets dans le dossier courant. Il est placé
hors du lanceur de vérification qui réinitialise la base. Une ouverture de
ticket peut notifier les administrateurs et les webhooks configurés.

Résultat attendu après déploiement : **67 réussites, 0 échec**, nettoyage
complet signalé, code de sortie 0.

Preuve de cette exécution : `audit-idor-1791033923585-27548af6.json` à la
racine du dépôt ; identifiants des fixtures, assertions et nettoyage,
sans jetons, mots de passe ni contenu client.
