# Inscriptions — corrections A01 / A02 de l'audit du 9 octobre 2026

Les inscriptions client, commerçant et livreur respectent désormais la même
exigence de confirmation d'adresse. Quand `REQUIRE_EMAIL_VERIFICATION=true`
(valeur par défaut en production), elles ne créent aucune session avant la
confirmation. L'ouverture d'un commerce par un compte existant est également
transactionnelle.

## Contrat des routes publiques

Les corps et validations restent ceux de `/api/auth/signup`,
`/api/auth/merchant-register` et `/api/drivers/register`, dont l'acceptation des
conditions. Les limitations de débit restent actives.

Si la confirmation est exigée, une inscription admissible répond **202** avec
`emailVerificationRequired: true` et un message générique, sans jeton, compte,
organisation ni profil livreur dans la réponse. La même réponse est utilisée
pour une adresse déjà inscrite ; elle ne donne aucun droit supplémentaire et
ne modifie pas le mot de passe ou le rôle du compte existant. Les autres erreurs
de validation, notamment de type de commerce ou d'URL indisponible, subsistent.

Si la confirmation n'est pas exigée, les réponses **201** historiques et leurs
jetons sont conservés. Les conflits d'adresse sont des erreurs métier, y
compris lorsqu'ils apparaissent après deux requêtes concurrentes.

Les formulaires commerçant, livreur web et livreur mobile affichent l'attente
de confirmation et restent déconnectés. Après avoir ouvert le lien reçu,
l'utilisateur se connecte avec ses identifiants habituels pour poursuivre son
parcours ; la validation administrative de son commerce ou dossier livreur
reste nécessaire.

## Cohérence des écritures

Chaque nouvelle inscription regroupe dans une transaction son compte, sa
preuve d'acceptation, son profil métier et son intention d'e-mail. Pour un
commerçant, cela comprend l'organisation, l'adhésion, la boutique et ses taxes.
Un échec tardif annule l'ensemble de ces écritures. Le géocodage est effectué
avant la transaction ; aucun SMTP n'est appelé dans celle-ci.

Une fiche client invité de même adresse n'est pas rattachée à l'inscription.
`createMany(skipDuplicates)` conserve cette protection même si une commande
invitée crée cette fiche simultanément. Le rattachement attend la preuve de
l'adresse, comme précédemment.

## Confirmation durable

Le message `auth.confirmation_email` de l'outbox contient uniquement `userId`.
Le worker relit le compte actif et non confirmé, génère le lien, stocke son
empreinte et attend le résultat SMTP. Un échec est repris par le worker
existant ; une reprise génère un nouveau lien et invalide le précédent.
Aucun jeton de confirmation ni lien secret n'est stocké dans le payload.

Lorsque la confirmation est exigée, `ENABLE_EMAIL_VERIFICATION=false` ne
supprime pas la préparation de l'e-mail. Lorsque la confirmation est
facultative, ce paramètre garde son comportement de désactivation.

## Validation et exploitation

- Tests des réponses 202 sans session, des adresses existantes et des conflits.
- Tests du worker, de la reprise après panne SMTP et de l'absence de secret dans
  l'outbox.
- Tests PostgreSQL de rollback après création de boutique ou enregistrement de
  l'outbox, et de doubles inscriptions concurrentes pour les trois rôles.
- Tests des formulaires commerçant, livreur web et livreur mobile sur réponse
  de confirmation, plus les contrôles types, lint et build habituels.

Aucune migration de schéma n'est nécessaire. Déployer ensemble backend et
consommateurs de la nouvelle réponse 202. Vérifier que le worker d'outbox est
démarré, que SMTP fonctionne et que les liens pointent vers le domaine public.
La supervision existante de l'outbox conserve les retards et messages en échec.

Ces corrections protègent les nouvelles créations. Elles ne suppriment ni ne
réparent automatiquement les comptes partiels ou sessions créés auparavant.
Avant ouverture du service, contrôler ces données sur le serveur et décider
de leur reprise ou révocation avec l'opérateur, en conservant les preuves
d'acceptation et l'historique métier.
