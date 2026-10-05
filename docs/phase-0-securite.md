# Phase 0 — sécurisation prioritaire

État au 5 octobre 2026 : **NON VALIDÉE, aucune ouverture à grande échelle ni
nouvelle fonctionnalité métier avant levée des points ci-dessous.**

Les modifications décrites sont locales. Aucun déploiement ni contrôle de la
configuration du VPS n'a été réalisé pendant cette intervention.

## Correctifs appliqués

### P0.1 — Accès aux ressources

- Le garde commerçant refuse désormais aussi les comptes support/admin sans
  appartenance à l'organisation cible. L'ancienne exemption `isSystemAdmin`
  ouvrait notamment les routes commerçantes de factures et de rapports.
- Une erreur de résolution du propriétaire d'un produit, d'une catégorie,
  d'une commande ou d'une autre ressource connue refuse l'accès, au lieu de
  poursuivre le traitement sans contrôle.
- Les réponses JSON de l'administration, quand le rôle n'a pas Facturation,
  retirent les champs financiers imbriqués et les pièces bancaires. Cela
  couvre les revenus auparavant exposés dans les listes commerçants et
  livreurs et les coordonnées bancaires de l'ancienne API admin.
- Une pièce bancaire commerçant exige Facturation pour l'équipe ; son
  propriétaire conserve l'accès. Une permission DRIVE ne donne plus accès aux
  documents EAT.
- Les comptes, rôles et sessions serveur sont relus sans cache entre requêtes,
  pour prendre en compte une révocation effectuée par une autre instance.
- Les refus REST, commerçants et Socket.IO sont ajoutés à `SecurityEvent` et
  aux journaux structurés. Aucun token, mot de passe ou numéro bancaire n'est
  ajouté aux événements introduits ici.

### P0.2 — Cadence et coûts

Le limiteur existant est conservé : pas de nouvelle dépendance npm. Son
stockage Redis utilise un script atomique pour le compteur et l'expiration.
Les clés issues des visiteurs sont hachées avant stockage.

| Opération | Politique |
|---|---|
| Connexion | 5 essais consécutifs par compte, toutes IP confondues ; fenêtre de 15 minutes, remise à zéro après succès |
| Budget auth IP | 50 appels par 15 minutes, partagé entre connexion, refresh et vérification des liens |
| Mot de passe oublié / renvoi confirmation | 3 demandes par destinataire et par 15 minutes ; budget IP complémentaire de 20 |
| Vérification email / reset | Budget auth IP avant lecture du jeton ; budget spécifique existant conservé sur reset |
| Changement de mot de passe | Budget existant de 10 essais par compte et 15 minutes |
| SSO | Budget existant de 60 échanges par IP et 15 minutes, étendu aux deux routes centrales |
| Webhook Stripe | 300 appels par IP et minute, avant lecture du corps brut ; signature Stripe toujours requise |
| API | Budget complémentaire de 120 appels par IP et minute pour tous les routeurs API |
| SMS | 10 réservations par numéro et 15 minutes ; 1 000 réservations globales par heure |

En production, Redis est obligatoire dans la configuration. Un compteur non
prêt ou défaillant produit une **503**, sans repli sur un compteur local ; les
SMS sont alors refusés. Hors production, les compteurs mémoire restent
utilisables. La 429 fournit `Retry-After`.

Le premier dépassement d'un budget est journalisé. Au dixième appel au-delà
du quota dans la même fenêtre, `BRUTEFORCE_RECURRENCE` est enregistré avec une
gravité HIGH et l'alerte existante de la plateforme est appelée. Sa réception
réelle dépend encore des paramètres de surveillance et des canaux configurés.
Les limites par compte/destinataire empêchent le contournement par changement
IP ; elles permettent aussi un blocage malveillant temporaire du compte visé,
compromis à valider avant production.

Les réponses de connexion pour adresse inconnue et mot de passe incorrect
restent identiques, avec comparaison bcrypt dans les deux cas. Mot de passe
oublié et renvoi anonyme de confirmation conservent leur réponse générique.

### P0.3 — Jetons et révocation

- Access : **15 minutes**, refresh : **7 jours**, cookie refresh et session
  serveur : **7 jours**. Une configuration différente est refusée au démarrage.
- Les secrets access et refresh doivent être distincts.
- Même signé correctement, un ancien token ayant une durée supérieure à la
  politique, sans expiration, avec `iat` futur ou sans identité est refusé.
- Refresh stocké : consommation conditionnelle unique, nouvel identifiant à
  chaque renouvellement, expiration en base contrôlée et révocation au rejeu.
- Un refresh sans `jti` est refusé. L'exception sans session est exclusivement
  réservée aux fixtures `NODE_ENV=test`, pas au développement ni à la production.
- La tolérance de concurrence existante de 10 secondes refuse le second
  renouvellement avec 409 sans fermer la session. Un rejeu tardif la révoque.
- Changement et réinitialisation du mot de passe mettent à jour le mot de
  passe et révoquent **toutes** les sessions dans une même transaction.
  Aucun nouveau token n'est remis après le changement ; le cookie est effacé.
- Un compte supprimé ou inactif est refusé dès le prochain contrôle REST ou
  Socket.IO. Les données de session restent soumises aux cascades du schéma.

## Revue des surfaces IDOR

Cette revue et les contrôles de fonctions avec dépendances simulées ne
constituent **pas un audit exhaustif validé par des tests HTTP**.

| Surface | Contrôle constaté / vérification locale | Validation encore requise |
|---|---|---|
| Commandes client | Possession par compte ou capacité de suivi dans les services existants ; contrôle de commande Socket testé localement | Deux clients réels, GET/suivi/paiement/pourboire et variantes URL |
| Adresses client | Routes `/client/me/addresses` dérivées de la fiche du compte | Deux clients, lectures et modifications avec champs falsifiés |
| Boutique / commandes commerçant | Organisation de la ressource comparée aux appartenances ; URL/query/body et panne testés localement | Tous les routeurs REST, CRUD et exports avec deux commerçants |
| Courses livreur | Gardes existants et suites `drivers-idor`, `dispatch-attribution-idor` | Exécution de ces suites et parcours avec deux livreurs |
| Support / finances | Refus billing, réponse filtrée et document bancaire testés localement | Réponses HTTP de tous les rôles et autorisations légitimes financières |
| Socket.IO | Compte/salon/commande, expiration et révocation testés localement | Suites Socket.IO avec connexions réelles, événements reçus et plusieurs instances |
| Documents | Propriétaire, rôles EAT/DRIVE, substitution de chemin et expiration de signature testés localement | Téléchargements HTTP et exports réels pour chaque type de document |

## Preuves exécutées

- `cd backend && node scripts/verification/phase0-offline.mjs` :
  **42 contrôles locaux réussis**, code TypeScript transformé par Node 24,
  dépendances externes simulées. La signature des liens de fichiers utilise
  réellement HMAC ; les JWT, Express, Redis et PostgreSQL sont simulés.
- Contrôle syntaxique des 26 fichiers TypeScript modifiés/ajoutés au moment du
  passage : réussi. Ce contrôle n'est pas une vérification des types.
- `git diff --check` : réussi.
- Suites Jest ciblées : **non exécutées**, `jest: not found`.
- Build : **non exécuté**, `prisma: not found` ; TypeScript n'a donc pas tourné.
- Installation npm : bloquée par l'accès réseau de l'environnement. Aucune
  modification des versions de dépendances n'a été faite pour contourner cela.

Des régressions Jest sont ajoutées pour le cloisonnement commerçant, le
filtrage financier, les durées/claims JWT et la déconnexion globale après
changement du mot de passe. Les mocks des suites existantes sont adaptés.

## Blocages de fin de phase

1. **Énumération à l'inscription toujours possible** : `/auth/signup`,
   `/auth/merchant-register` et `/drivers/register` distinguent les adresses
   déjà enregistrées (`EMAIL_EXISTS`) des créations réussies avec session.
   Les rendre indiscernables exige de remplacer l'inscription avec session
   immédiate par une réponse générique et une preuve d'adresse avant connexion,
   avec adaptation des parcours web/mobile. Ce correctif reste à réaliser.
2. **Liens de fichiers déjà signés** : capacités portables valables cinq minutes,
   même après révocation de la session qui les a obtenues. La révocation
   immédiate de ces capacités reste à réaliser si elle s'applique aussi aux
   liens de lecture et aux exports déjà délivrés. Les téléchargements avec
   bearer relisent bien les droits.
3. Installer les dépendances verrouillées, générer Prisma et réussir
   `npm run build` et toutes les suites Jest de sécurité. Aucun test vert de
   cette intervention ne prouve à lui seul l'absence d'IDOR sur tous les endpoints.
4. Exécuter la matrice HTTP/Socket.IO/documents avec deux comptes par rôle,
   PostgreSQL et Redis réels, notamment la transaction de changement de mot
   de passe, les appels concurrents et la révocation entre instances.
5. Vérifier la centralisation effective des événements et la réception des
   alertes sur l'environnement déployé.
6. Vérifier la reconnexion des clients web/mobile après changement de mot de
   passe : les anciens composants attendaient des tokens de remplacement.

Pour le déploiement ultérieur, mettre `JWT_EXPIRES_IN=15m`,
`JWT_REFRESH_EXPIRES_IN=7d`, renseigner Redis, vérifier `TRUST_PROXY` et fermer
l'accès direct au backend hors du proxy prévu. Les anciens tokens longs seront
refusés et les utilisateurs devront se reconnecter. Le webhook Stripe peut
recevoir 429/503 lorsque son quota ou son compteur échoue ; les relances
Stripe et leur idempotence doivent être vérifiées avant publication.

**La Phase 0 reste ouverte. Aucun engagement « aucun accès inter-comptes » ni
« aucun correctif critique en attente » n'est prononcé.**
