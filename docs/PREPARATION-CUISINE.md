# Délai habituel et mode « Cuisine chargée »

Les deux écrans web de réponse aux commandes (détail et écran cuisine)
proposent un délai prérempli avec **− / minutes / +**. Chaque appui ajuste de
cinq minutes, entre 1 et 240 minutes ; la saisie libre reste possible.
L'ajustement d'une commande ne change pas les prochaines suggestions.

## Calcul de la suggestion

- Le temps habituel est la moyenne des durées entre acceptation et passage
  réel à `READY`, arrondie au multiple supérieur de cinq minutes. Le commerçant
  doit donc cliquer sur « Prête » au bon moment.
- Il faut cinq observations admissibles. Les cinquante plus récentes sur
  soixante jours sont consultées. À partir de dix observations, les 10 % de
  chaque extrémité sont écartés ; les durées inférieures à deux minutes ou
  supérieures à deux heures sont ignorées.
- Seules les commandes acceptées avec une capacité encore disponible et
  sans rush manuel sont retenues. Les retraits programmés, annulations et
  commandes supprimées sont exclus. Une commande remise en préparation après
  `READY` n'alimente plus la moyenne.
- Tant que cet historique manque, la durée configurée est utilisée : vingt
  minutes initialement, réglable de 5 à 120 minutes.
- Les commandes `ACCEPTED`/`PREPARING` occupent des postes parallèles (trois
  initialement, réglables de 1 à 30). La simulation tient compte de leur
  acceptation et du délai déjà annoncé, puis estime l'attente avant qu'un
  poste soit libre. Une commande dépassée et non prête garde cinq minutes
  de marge. Les retraits programmés au-delà de la durée par défaut ne sont
  pas considérés comme du travail immédiat.
- La suggestion est : temps habituel + attente estimée + supplément rush,
  arrondie à cinq minutes et plafonnée à 240 minutes. Deux cents commandes
  actives atteignent directement ce plafond de prudence.

C'est une estimation de charge, pas une mesure de chaque plat ni une prédiction
de fréquentation par heure. La capacité doit être réglée selon la cuisine.
Les observations de charge à l'acceptation sont des instantanés ; elles ne
réservent pas un poste et ne bloquent pas les acceptations concurrentes.

## Réglages et rush

Le volet « Capacité et mode cuisine chargée » permet au responsable de régler
la durée initiale et le nombre de commandes parallèles, puis d'ajouter un
supplément pendant 30, 60 ou 120 minutes. L'expiration est évaluée par le serveur
sans tâche planifiée. Le mode normal peut être rétabli immédiatement.
Changer seulement la capacité peut conserver le rush actuel.

Les délais des commandes déjà acceptées ne sont jamais réécrits par ces
réglages. La suggestion est relue toutes les vingt secondes et après les
événements locaux de commandes. Une saisie manuelle reste prioritaire pour
la commande ouverte. Si la suggestion est indisponible, une saisie manuelle
reste nécessaire avant acceptation.

`GET /api/order-management/:storeId/preparation` autorise le personnel qui
peut lire la boutique. `PUT` exige le droit `manage` (responsable ou
administrateur). Les droits de boutique sont relus en base, y compris quand
le routeur est monté isolément. Les applications natives conservent leur
interface actuelle, mais leurs transitions de statut utilisent le même
horodatage serveur.

## Installation et vérification

La migration **`20261103120000_kitchen_preparation` doit être appliquée avant
de lancer ce backend**. Elle ajoute quatre réglages cuisine sur `Store`, puis
`readyAt` et `preparationCalmSample` sur `Order`, avec un index de consultation.
Elle ne reconstruit pas l'historique à partir de `updatedAt` ou de l'heure de
livraison : les anciennes commandes restent sans observation admissible.

Le client Prisma a été régénéré avec les générateurs officiels 7.10.0 en mode
sans téléchargement natif, depuis un outillage temporaire. Aucun manifeste
ni lockfile applicatif n'a changé.

Vérifications locales : calcul de la moyenne et de la charge, expiration du
rush, sélection des observations, droits inter-boutiques et staff/responsable,
validation des réglages, régressions d'acceptation, paiement et réservation,
interactions sur les deux écrans web, parité FR/EN, TypeScript et lint.
Le 3 novembre 2026 : **61 tests ciblés réussis** (39 calcul/acceptation,
8 routes/droits, 5 paiement/réservation, 9 interface/traductions).
La migration SQL a aussi été exécutée sur PostgreSQL embarqué (PGlite) avec
des tables initiales minimales : conservation des lignes existantes, valeurs
par défaut, contrainte et index vérifiés. Cela ne valide pas toute la chaîne
de migrations sur une base représentative.

Les tests HTTP utilisent une base simulée et les tests web un transformateur
TypeScript temporaire (le chargement natif SWC reste bloqué dans cet
environnement). Le serveur est compilé avec esbuild. Aucun déploiement ni
migration de la base de production n'a été réalisé.
