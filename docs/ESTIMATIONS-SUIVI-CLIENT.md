# Fourchette d'arrivée dans le suivi client

Le suivi web invité `/track` et le détail de commande connecté
`/client/orders/:id` affichent `estimationLivraison`, calculé par
`GET /api/orders/:id` après vérification du compte ou du jeton de suivi.

Le calcul réutilise le planificateur de livraison : véhicule, position GPS,
préparation annoncée, retraits et remises dans leur ordre, attentes chez les
clients. Une réservation termine d'abord la tournée actuelle avant de rejoindre
le nouveau restaurant. La réponse publique ne contient aucune adresse, position
ou identité des autres commandes.

La fourchette ajoute une marge de deux minutes minimum ou 20 % du temps prévu,
puis arrondit les bornes ; elle ne constitue pas une garantie ni une prédiction
de trafic routier réel. Les estimations en minutes calculées uniquement depuis
la distance ont été retirées des deux vues de suivi.

Sans livreur attribué/réservé, aucun délai de recherche n'est inventé. Une
préparation inconnue, un trajet incomplet ou un GPS manquant empêche l'affichage
d'une heure. Une préparation dépassée de deux minutes déclenche un message
d'attente d'actualisation. Un GPS de deux minutes ou signalé perdu invalide le
calcul. La livraison par le restaurant lui-même garde une explication, sans
estimation de trajet inventée.

Les informations sont relues toutes les vingt secondes pendant une commande
active. La carte invitée est également relue pour suivre les prises en charge.
Les lectures périodiques ne se chevauchent pas et sont annulées au nettoyage de
l'effet. La carte reçoit de nouveaux instantanés en complément des événements
temps réel. Le suivi connecté conserve ses relectures événementielles existantes.

Une réponse expire après soixante secondes au plus, plus tôt si le GPS approche
de sa limite. Le composant contrôle cette durée toutes les cinq secondes avec
une horloge monotone depuis la réception, indépendante de l'heure du téléphone.
Une réponse identique ne renouvelle pas sa validité. Hors ligne, l'heure est
retirée et un message d'actualisation apparaît. Une livraison terminée ou annulée
n'affiche plus de fourchette.

Vérifications locales : tests du calcul, des autorisations et de la
confidentialité, puis tests du composant (étapes, données manquantes, expiration,
horloge décalée, réponse identique, livraison terminée) et parité FR/EN.
Les tests HTTP utilisent des doublures de base, sans livraison ni paiement réel.
Le lint et TypeScript sont contrôlés sur les deux projets, et le serveur est
compilé avec esbuild. Les tests web utilisent temporairement le transformateur
TypeScript du backend : le build Next reste à vérifier dans un environnement
où le chargement natif SWC fonctionne. Aucune migration ou nouvelle dépendance
applicative n'est ajoutée ; aucun déploiement n'est réalisé.
