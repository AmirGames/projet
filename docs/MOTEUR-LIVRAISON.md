# Moteur de livraison ZupEat — première amélioration

## Périmètre

Le dispatch compare désormais les livreurs libres, bientôt libres et déjà en
tournée selon le délai estimé de remise au client. Une tournée n'a plus la
priorité automatique sur un livreur libre. ZupDrive n'est pas concerné.

Exemple : un livreur proche attend encore quinze minutes la préparation de
sa première commande. Un livreur libre qui peut livrer la nouvelle commande
avant lui reçoit la proposition, même si le premier peut faire un petit
détour géographique.

## Calcul

`planification-livraison.service.ts` simule les arrêts dans l'ordre utilisé
par le parcours livreur : retraits d'abord, puis remises ; les remises déjà
figées conservent leur ordre. Il tient compte :

- de la position du livreur ou du dernier client pour un livreur bientôt libre ;
- du temps restant avant sa libération ;
- des vitesses existantes par véhicule : vélo 15, scooter 25, voiture 30 km/h ;
- d'un facteur de trajet de 1,3 sur les distances à vol d'oiseau ;
- d'une minute par retrait et par remise ;
- de `estimatedReadyAt` pour chaque retrait. Une commande `READY` ou déjà
  récupérée n'attend pas cette ancienne heure.

Le score est le temps avant la nouvelle remise, augmenté du retard cumulé
ajouté aux autres clients de la tournée. Le plus petit score gagne, parmi
les véhicules adaptés. À score égal, une réservation « bientôt libre » passe
après un candidat immédiatement mobilisable, puis l'identifiant départage.
Le choix manuel d'un livreur libre éligible reste prioritaire.

## Regroupements

Un ajout doit respecter la capacité et le détour kilométrique configurés,
ainsi qu'un plafond de **300 secondes de retard estimé par client existant**.
Pour un lot de commandes non attribuées, chaque remise est aussi comparée à
une livraison seule depuis la même position : les insertions successives ne
peuvent pas additionner plusieurs fois ces cinq minutes.

Les lots sont calculés depuis la position réelle du livreur. Les courses
réservées à un autre livreur en sont exclues. Sans coordonnées exploitables,
aucun regroupement n'est construit ; le dispatch simple reste possible si
seule la destination manque. Les coordonnées zéro sont valides.
Une tournée en attente chez un client injoignable ne reçoit pas de nouveau
retrait ; l'enchaînement après remise reste géré par la réservation existante.

Les règles de refus, relance, réservation, véhicule, autorisation de livraison
plateforme et les transactions d'acceptation restent applicables. Les
coefficients de temps servent au choix du livreur, sans modifier sa
rémunération.

## Portée des estimations

Le calcul est refait à chaque recherche/proposition avec la préparation et
les courses alors connues. Le journal `Course proposée` contient la méthode
`distance-preparation-v1`, le délai de remise de la candidature avant
composition éventuelle du lot, le retard maximal estimé et le score.

Ce sont des estimations locales, pas une garantie de délai. Le plafond porte
sur le retard prédit au moment du regroupement ; il ne couvre pas un retard
réel de cuisine ou un incident ultérieur. Les tournées existantes sont
comparées avant/après chaque ajout ; leur promesse initiale n'est pas stockée.

Cette première version n'utilise ni trafic réel ni matrice d'itinéraires
routiers. Elle conserve l'ordre de proximité des arrêts non figés, sans
recherche d'optimum global. Elle ne publie pas encore ces estimations dans
l'interface client. Aucune migration, dépendance applicative ou activation
de la livraison plateforme n'est nécessaire. Aucun déploiement n'est effectué
par ce changement.

## Vérifications

Vérification locale du 2 novembre 2026 : **210/210 tests sur six suites**,
lint backend complet sans avertissement, `tsc --noEmit` et compilation
esbuild du serveur réussis. Le téléchargement natif de Prisma étant refusé
par la politique réseau, le client a été généré avec les paquets officiels
`@prisma/internals` et `@prisma/client-generator-js` 7.10.0, en mode
`skipDownload`, depuis un outillage temporaire hors du dépôt. Le manifeste
et le lockfile applicatifs restent inchangés. Cette vérification ne constitue
pas une exécution de `npm run build` avec téléchargement des moteurs natifs.

Suites ciblées, depuis `backend` :

```sh
npx jest src/modules/drivers/__tests__/planification-livraison.test.ts src/modules/drivers/__tests__/dispatch-bientot-libre.test.ts src/modules/drivers/__tests__/dispatch-vehicule.test.ts src/modules/drivers/__tests__/dispatch-attribution-idor.test.ts src/modules/drivers/__tests__/drivers-routes-caracterisation.test.ts src/modules/orders/__tests__/suivi-commande.test.ts --runInBand
npm run lint
npx tsc --noEmit
```

Les tests couvrent les préparations, commandes prêtes/récupérées, véhicules,
réservations, refus, choix manuel, regroupements acceptés/refusés, plafond
cumulatif des lots, ordre des remises et coordonnées invalides. Les tests de
routes utilisent une API locale et des doublures de base ; ils ne remplacent
pas une recette PostgreSQL/appareil ni une mesure de performance en charge.
