# Audit des permissions admin/superowner — 3 octobre 2026

**Suivi au 4 octobre 2026 :** des déploiements ultérieurs ont été annoncés,
et les audits Socket.IO et paiements ont été menés. Les 12 contrôles décrits
ici sont une sonde de refus, pas une validation des mutations par des membres
de l'équipe. Les scénarios de révocation et de caches sur plusieurs instances
restent à compléter. Voir [l'état du projet](etat-projet.md).

## Périmètre et preuves

Examen des gardes des routes admin, superowner et administration DRIVE,
du classement des routes par section, de la gestion de l'équipe et des rôles,
du chargement des droits depuis la base et des scripts de vérification.
Les droits ne viennent pas des indicateurs fournis par le client dans un JWT
ou un corps de requête : l'authentification charge le compte et ses rôles en
base. La gestion des membres et des permissions dispose en plus d'un garde
strict réservé au superowner.

Sonde HTTP de production : **12 contrôles réussis**, compte client temporaire
supprimé et session révoquée. Le correctif précédent des invitations renvoie
403 `EMAIL_NOT_VERIFIED`. Les routes config admin, membres de l'équipe, rôles
et administration chauffeurs refusent le visiteur (401) et le compte ordinaire
(403). Aucune mutation d'administration n'a été tentée en production.
Rapport : [audit-admin-1791038849047-821f07d9.json](audits/audit-admin-1791038849047-821f07d9.json) dans `docs/audits/`.

## Corrections locales

### Une variante d'URL ne doit pas changer la permission

Express ignore la casse des routes, mais `sectionDeLaRoute` utilisait des
expressions sensibles à la casse. `/organizations/:id/CLOSE` pouvait donc
tomber sur la règle générale Organisations, au lieu de Fermeture. De même,
`TIER` ou `COMMISSION-PROMO` pouvaient contourner Formules, et `DOSSIER`
sur un incident pouvait contourner le droit d'export sensible et retomber
sur Support livreurs.

Le chemin est désormais décodé et normalisé pour le classement uniquement,
sans modifier les identifiants transmis aux gestionnaires. Les préfixes
doivent finir sur une frontière de segment. Les cas mixtes et les formes
encodées ont des régressions ; les tests HTTP Express montrent que CLOSE
est réellement reconnu par le routeur mais refusé sans le droit spécifique.
Une forme encodée reconnue par le classeur n'est pas nécessairement une route
statique reconnue par Express : elle reste classée de manière conservatrice.

### Conditions financières et ancienne route de formule

`PATCH /superowner/organizations/:id/conditions` était couvert par
Organisations, alors qu'il fixe commissions, prix mensuel et quotas.
`PATCH /admin/merchants/:id` ne modifie que la formule mais utilisait aussi
Organisations. Ces deux opérations exigent maintenant Formules. Le GET
du dossier commerçant conserve Organisations. Les opérations légitimes avec
le droit Formules restent permises.

### Promotion d'un compte identifié par adresse e-mail

Le superowner pouvait promouvoir un compte dont l'adresse n'était pas
confirmée. Une adresse revendiquée lors de l'inscription ne prouve pas son
contrôle ; une promotion destinée au titulaire pouvait bénéficier au compte
qui avait réservé cette adresse. La route exige maintenant `emailVerified`
avant toute écriture de droits, sinon 403 `USER_EMAIL_NOT_VERIFIED`.
Cela ne permettait pas à un compte ordinaire de se promouvoir lui-même :
la nouvelle vérification complète le garde superowner déjà en place.

## Validation locale

**58 tests réussis dans 3 suites** : permissions de sections et de plateforme,
lecture/écriture, variations de chemins, interdiction de gestion de l'équipe
pour utilisateur et SuperAdmin, promotion légitime journalisée, refus d'une
adresse non confirmée, refus d'un second superowner et rotation des sessions.
TypeScript et build réussis. Vérification syntaxique des deux scripts modifiés
et `git diff --check` réussis.

Les tests HTTP de gestion de l'équipe simulent l'authentification et la base,
mais exécutent le vrai routeur et les gardes. Le test de fermeture emploie
Express et le vrai classeur de permissions. Les essais de rôles privilégiés
ne sont donc pas des pentests de production. Aucun compte administrateur
réel n'a été utilisé ni modifié.

Les scripts PostgreSQL adaptés n'ont pas été exécutés : Docker local est
indisponible. Le script de promotion vérifie désormais le refus avant
confirmation et l'absence de droit en base, puis simule la confirmation de
sa fixture et teste la promotion légitime. À rejouer uniquement sur une base
dédiée : le lanceur de vérification réinitialise la base de test.

## Fichiers

- `backend/src/modules/auth/permissions-plateforme.service.ts` : classement
  normalisé, frontières de segment et droits Formules corrigés.
- `backend/src/modules/auth/team.admin.routes.ts` : confirmation requise
  avant promotion.
- `backend/src/modules/auth/__tests__/permissions-plateforme.test.ts` :
  scénarios de contournement et accès légitimes.
- `backend/src/modules/auth/__tests__/admin-escalade.test.ts` : tests HTTP
  des gardes, promotions et variantes de fermeture.
- `backend/scripts/verification/verif-admin-motdepasse.mjs` et
  `backend/scripts/verification/audit-superowner.mjs` : fixtures confirmées
  pour les promotions légitimes, régression refus/état en base.
- `backend/scripts/security/audit-production-admin.mjs` : sonde autonome
  sans changement de droits ni réinitialisation, nettoyage du compte créé.
- `docs/audit-zupdrive-2026-10-03.md` : confirmation du déploiement précédent.

## Statut et limites

Au moment du passage initial, les nouvelles corrections étaient **locales,
non publiées et non déployées**. Elles changent les droits requis pour les modifications
financières : attribuer Formules uniquement aux rôles qui doivent les faire.
Les comptes existants non confirmés devront confirmer leur adresse avant
une nouvelle promotion dans l'équipe.

Ce passage ne certifie pas toutes les routes ni tous les scénarios de
révocation. Les caches de comptes/rôles sont locaux au processus et limités à
30 secondes ; les mutations de rôles invalident le cache du processus qui
les traite. Une invalidation sur plusieurs instances, les actions déjà en
cours lors d'une révocation et le traitement d'un utilisateur marqué BANNED
méritent une validation dédiée. Le middleware de restriction commerçant
concerne les organisations, pas la suspension des membres de l'équipe.

Les audits Socket.IO et paiements/remboursements/webhooks ont ensuite été
menés et sont consignés dans les rapports correspondants. Les accès avec
des comptes distincts, le changement de rôle et la révocation pendant une
connexion sur le déploiement restent des validations complémentaires ;
voir [l'état courant](etat-projet.md).
