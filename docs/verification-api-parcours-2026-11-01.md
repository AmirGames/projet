# Vérification des parcours API — 1 novembre 2026

## Résultat local

Sur le worktree de la branche `claude/awesome-ride-m9lci8`, basé sur le commit
`740ba52cdef8a8b21fad87843aa2053fe40354ae`, les corrections d'attribution,
de tournée, de preuve de livraison et de versement ont été vérifiées le
1 novembre 2026 sur une base PostgreSQL locale dédiée et migrée. L'API et les
scripts de vérification utilisaient `NODE_ENV=test`.

| Parcours | Script | Résultat |
|---|---|---:|
| Attribution et rémunération de course | `verif-attribution.mjs` | 41/41 |
| Tournées et ordre des courses | `verif-tournee.mjs` | 55/55 |
| Codes et preuves de livraison, photo privée et suivi client | `verif-preuve-livraison.mjs` | 57/57 |
| Arrêtés, paiements et annulations de relevés livreurs | `verif-versements-livreurs.mjs` | 56/56 |
| Parcours complet du livreur et affichage client | `verif-parcours-livreur.mjs` | 27/27 |
| **Total des cinq parcours API** |  | **236/236** |

Les tests Jest ciblés des fichiers privés et du limiteur ont réussi (**27/27**),
et `npx tsc --noEmit` a réussi.

## Corrections couvertes

- Le script de vérification récupère le code de remise via le suivi client,
  dont les droits autorisent cette lecture, plutôt que de lire sa valeur
  chiffrée directement en base.
- Les tests de preuve déposent une vraie photo multipart dans le stockage
  privé. Le suivi client reçoit une adresse signée de courte durée, liée à la
  commande et à sa photo de remise ; elle ne donne pas accès aux autres
  fichiers privés. La consultation est journalisée.
- Le limiteur public garde son plafond normal de **120 appels/minute** en
  développement et en production. En environnement `test` seulement, son
  plafond est relevé à 1 000 pour permettre les suites longues depuis une même
  adresse locale ; les limiteurs spécifiques restent actifs.
- Le contrôle de texte du versement attend le message réel de l'API « déjà
  versé ».
- Le conflit documentaire dans `docs/etat-projet.md` est résolu ; aucun marqueur
  de conflit ne subsiste.

## Portée et limites

Ces résultats valident les parcours contre le code local et la base locale de
test. Ils ne constituent ni un résultat de CI sur ce worktree, ni une
vérification de `zupeat.com`, ni un essai de paiement Stripe réel, ni une
preuve de déploiement VPS. Les changements décrits ici restent à committer,
pousser, puis déployer et vérifier séparément.
