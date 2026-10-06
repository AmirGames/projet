# Audit Socket.IO — 3 octobre 2026

**Suivi au 4 octobre 2026 :** un déploiement ultérieur a été annoncé ; les
six sondes Socket.IO ont été rejouées avec succès, comme consigné dans
l'audit paiements (10/10 en incluant ses quatre refus). Cela ne remplace
pas les scénarios entre comptes authentifiés, de révocation ou Redis sur
plusieurs instances. Voir [l'état courant](etat-projet.md).

Base inspectée : branche `claude/awesome-ride-m9lci8`, commit `232e3fbd`.
Au moment du passage initial, les corrections étaient locales, à publier
et déployer. Le suivi ci-dessus décrit les confirmations ultérieures.

## Constats et corrections

- Un e-mail déclaré, sans vérification, autorisait le suivi d'une commande
  par `customerEmail` et l'abonnement au salon des notifications personnelles.
  Ces deux accès exigent désormais `emailVerified`. Les notifications d'une
  organisation utilisent son membership et le salon interne `compte-<userId>` :
  elles restent accessibles à ses membres, même sans e-mail vérifié.
- Tout administrateur système recevait le chat support livreurs et pouvait
  suivre toute commande, sans plateforme ni permission. Le chat exige maintenant
  la permission EAT `driver-support`, le suivi administratif EAT `billing`,
  comme les routes administratives de commandes. Le superowner conserve ces accès.
- Les salons conservaient les permissions du jour de connexion. Chaque émission
  privée relit maintenant le compte, la session et l'autorisation du salon.
  Les commandes relisent aussi le membership et le livreur actuellement affecté.
  Une autorisation perdue retire le salon ; une identité/session invalide ferme
  la connexion. Les messages entrants authentifiés effectuent le même contrôle.
- Les sockets refusaient une session déjà révoquée mais acceptaient en production
  les anciens JWT sans `sid`, ainsi que les comptes supprimés ou dont le mot de
  passe avait changé. Le handshake applique désormais ces vérifications et les
  émissions contrôlent aussi l'expiration du JWT.
- Le cache SSO de trente secondes pouvait masquer une révocation sur une autre
  instance. Une option `sansCache` conserve le comportement HTTP existant et
  force la lecture de session pour Socket.IO. Les permissions de rôles sont
  également relues directement, sans cache.
- Le flux global `plateforme` mélange des identifiants de toutes les sections
  et plateformes. Sa diffusion complète est réservée au superowner. Les rôles
  partiels conservent leurs flux propres autorisés ; leurs tableaux de bord
  peuvent nécessiter un rafraîchissement pour les modifications diffusées
  uniquement par ce flux global.

Les vitrines restent publiques. Leur événement de modification ne contient ni
identifiant d'objet privé ni organisation. Les identifiants de salons sont
limités à 128 caractères et une connexion ne peut rejoindre plus de 100 salons.
Ces limites ne remplacent pas un audit complet des abus et du rate-limit.

## Fichiers

- `backend/src/modules/realtime/socket.ts` : contrôles de handshake, de messages
  entrants et de toutes les émissions privées ; salons par identité pour les
  memberships ; diffusion dédupliquée via `fetchSockets`, compatible avec
  l'interface de l'adaptateur Redis.
- `backend/src/modules/realtime/socket-access.ts` : identité/session et droits
  frais, autorisation de commandes, de salons et de permissions EAT.
- `backend/src/modules/auth/sso.service.ts` : option de contrôle sans cache.
- `backend/src/modules/realtime/socket-security.test.ts` : 28 cas, serveur
  Socket.IO et clients réels locaux, accès aux données et auth simulés.
- `backend/src/modules/auth/__tests__/session-rotation.test.ts` : régression de
  révocation externe avec cache actif.
- `backend/scripts/security/audit-production-socket.mjs` : sonde HTTPS de lecture
  seule ; nécessite la dépendance `socket.io-client` installée dans `backend`
  (déjà présente dans les dépendances de développement de ce checkout).

## Vérification locale

Commande depuis `backend`, avec variables d'environnement de test synthétiques :

```text
npm test -- --runTestsByPath src/modules/realtime/socket-security.test.ts src/modules/auth/__tests__/session-rotation.test.ts src/modules/auth/__tests__/permissions-plateforme.test.ts src/modules/auth/__tests__/admin-escalade.test.ts
```

Résultat : **87/87 tests, quatre suites**, dont 28 nouveaux tests Socket.IO.
Cas couverts : Alice/Bob en WebSocket et polling, salons privés devinés,
visiteur public, données publiques réduites, e-mail non vérifié ou vérification
retirée, membership retiré, livreur réaffecté, notifications d'une organisation
suspendue, expiration/révocation/session supprimée, mot de passe modifié,
refus au handshake, distinction EAT/DRIVE, permissions et rôle retirés,
superowner retiré, déduplication et erreur de base fermant l'accès.

`npm run build` : Prisma generate, TypeScript et les deux bundles réussis.
`git diff --check` et validation syntaxique du script : réussis.
L'avertissement SMTP `QUERYWRAP` préexistant demeure dans les tests de sessions
qui importent les routes d'authentification ; aucune suite n'a échoué.

## Sonde du déploiement existant

Sur `https://api.zupeat.com`, sans création ni mutation de données :
**6/6 contrôles réussis** : health ready HTTP 200 ; connexion anonyme et refus
de commande privée en WebSocket et polling ; jeton invalide refusé.
Rapport local : [audit-socket-1791039944835.json](audits/audit-socket-1791039944835.json).

Cette sonde confirme la disponibilité du déploiement existant. Elle ne valide
pas les nouvelles corrections avant leur déploiement et ne constitue pas un
pentest complet avec comptes privilégiés.

## Limites et comportements

- Pas de serveur Redis multi-instance ni de PostgreSQL réel exécuté localement :
  ces services ne sont pas disponibles ici. Les tests utilisent de vrais
  transports Socket.IO mais simulent la base, le vérificateur JWT et le SSO.
- Les contrôles supplémentaires impliquent des lectures de base par émission
  privée et destinataire. Aucun test de charge n'a été exécuté.
- Une connexion inactive peut rester ouverte après expiration ou révocation ;
  elle est fermée au prochain message entrant ou envoi privé et ne reçoit pas
  cet envoi. Il n'y a pas de minuteur de déconnexion immédiate des sockets inactifs.
- Un salon retiré après perte de droits n'est pas automatiquement rejoint à
  leur restitution. Le client doit se réabonner à la commande ou se reconnecter
  pour ses salons automatiques, notamment après vérification de son e-mail.
- Les notifications personnelles et de livreur adressées par e-mail nécessitent
  maintenant une adresse vérifiée. Les flux fondés sur un membership utilisent
  l'identifiant du membre, sans cette exigence et sans bloquer les comptes suspendus.

L'audit paiements/remboursements/webhooks et abus/rate-limit a ensuite été
mené. Pour les validations encore ouvertes, voir [l'état du projet](etat-projet.md).
